import "server-only";
import { connectMongo } from "./mongo";
import { User } from "./models/user";
import { getTopicBySlug } from "./catalog";
import type { TrackSlug } from "./types";

const XP_PER_TOPIC = 10;

export type ProgressResult = {
  topicStatus: "not_started" | "in_progress" | "completed";
  currentQuestionId: string | null;
  completedCount: number;
  totalCount: number;
  topicCompleted: boolean;
  streakUpdated: boolean;
  streak: { count: number; lastActiveDayLocal: string | null };
  xp: number;
  xpAwarded: number;
};

function normalizeTimeZone(timeZone?: string): string {
  if (!timeZone) return "UTC";

  try {
    Intl.DateTimeFormat("en-CA", { timeZone }).format();
    return timeZone;
  } catch {
    // Older clients do not send a timezone, and a client-controlled value must
    // never make progress updates fail.
    return "UTC";
  }
}

function dayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function markQuestionCompleted(
  clerkId: string,
  track: TrackSlug,
  topicSlug: string,
  questionId: string,
  timeZone?: string,
): Promise<ProgressResult> {
  await connectMongo();

  const topic = getTopicBySlug(track, topicSlug);
  if (!topic) throw new Error(`unknown topic: ${track}/${topicSlug}`);
  if (!topic.question_ids.includes(questionId)) {
    throw new Error(`question ${questionId} is not in ${track}/${topicSlug}`);
  }

  const allQuestionIds = topic.question_ids;
  const totalCount = allQuestionIds.length;

  const user = await User.findOne({ clerkId });
  if (!user) throw new Error("user not found");

  // Ensure module exists
  if (!user.modules.has(track)) {
    user.modules.set(track, {
      topicProgress: new Map(),
      streak: { count: 0, lastActiveDayLocal: null, lastActiveAt: null },
      xp: 0,
    });
  }
  const mod = user.modules.get(track)!;
  // InferSchemaType marks nested defaults optional; backfill for old docs.
  if (!mod.streak) {
    mod.streak = { count: 0, lastActiveDayLocal: null, lastActiveAt: null };
  }
  const streak = mod.streak;

  // Ensure topic state exists
  if (!mod.topicProgress.has(topicSlug)) {
    mod.topicProgress.set(topicSlug, {
      status: "not_started",
      currentQuestionId: allQuestionIds[0] ?? null,
      completedQuestionIds: [],
    });
  }
  const topicState = mod.topicProgress.get(topicSlug)!;

  // Idempotent: don't double-count
  if (!topicState.completedQuestionIds.includes(questionId)) {
    topicState.completedQuestionIds.push(questionId);
  }

  const completedCount = topicState.completedQuestionIds.length;
  const wasAlreadyCompleted = topicState.status === "completed";
  let topicCompleted = false;
  let xpAwarded = 0;

  if (completedCount >= totalCount) {
    topicState.status = "completed";
    topicState.currentQuestionId = null;
    topicCompleted = true;
    if (!wasAlreadyCompleted) {
      xpAwarded = XP_PER_TOPIC;
      mod.xp += xpAwarded;
    }
  } else {
    topicState.status = "in_progress";
    // Advance currentQuestionId to next uncompleted question
    const nextId = allQuestionIds.find(
      (id) => !topicState.completedQuestionIds.includes(id),
    );
    topicState.currentQuestionId = nextId ?? null;
  }

  // Streak check
  const streakTimeZone = normalizeTimeZone(timeZone);
  const now = new Date();
  const today = dayKey(now, streakTimeZone);
  let streakUpdated = false;

  if (streak.lastActiveDayLocal !== today) {
    const lastDay = streak.lastActiveDayLocal;
    if (!lastDay) {
      streak.count = 1;
    } else {
      const yesterday = new Date(now);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = dayKey(yesterday, streakTimeZone);
      if (lastDay === yesterdayStr) {
        streak.count += 1;
      } else {
        streak.count = 1; // gap > 1 day → reset (freeze logic deferred)
      }
    }
    streak.lastActiveDayLocal = today;
    streak.lastActiveAt = new Date();
    streakUpdated = true;
  }

  await user.save();

  return {
    topicStatus: topicState.status as "not_started" | "in_progress" | "completed",
    currentQuestionId: topicState.currentQuestionId,
    completedCount,
    totalCount,
    topicCompleted,
    streakUpdated,
    streak: {
      count: streak.count,
      lastActiveDayLocal: streak.lastActiveDayLocal,
    },
    xp: mod.xp,
    xpAwarded,
  };
}

export type TrackProgressSnapshot = {
  topics: Map<
    string,
    { status: string; completedCount: number; completedQuestionIds: string[] }
  >;
  completedQuestionIds: Set<string>;
  starredQuestionIds: Set<string>;
  lastVisited: { topicSlug: string; questionId: string; at: Date } | null;
  streak: { count: number };
  xp: number;
};

export async function getTrackProgressSnapshot(
  clerkId: string,
  track: TrackSlug,
): Promise<TrackProgressSnapshot> {
  const empty: TrackProgressSnapshot = {
    topics: new Map(),
    completedQuestionIds: new Set(),
    starredQuestionIds: new Set(),
    lastVisited: null,
    streak: { count: 0 },
    xp: 0,
  };
  await connectMongo();
  const user = await User.findOne({ clerkId });
  if (!user) return empty;
  empty.starredQuestionIds = new Set(user.starredQuestions ?? []);
  const mod = user.modules.get(track);
  if (!mod) return empty;
  for (const [slug, state] of mod.topicProgress) {
    empty.topics.set(slug, {
      status: state.status,
      completedCount: state.completedQuestionIds.length,
      completedQuestionIds: [...state.completedQuestionIds],
    });
    for (const id of state.completedQuestionIds) {
      empty.completedQuestionIds.add(id);
    }
  }
  if (mod.lastVisited?.questionId && mod.lastVisited.topicSlug) {
    empty.lastVisited = {
      topicSlug: mod.lastVisited.topicSlug,
      questionId: mod.lastVisited.questionId,
      at: mod.lastVisited.at ?? new Date(0),
    };
  }
  empty.streak = { count: mod.streak?.count ?? 0 };
  empty.xp = mod.xp ?? 0;
  return empty;
}

export async function recordVisit(
  clerkId: string,
  track: TrackSlug,
  topicSlug: string,
  questionId: string,
): Promise<void> {
  await connectMongo();
  const user = await User.findOne({ clerkId });
  if (!user) return;
  // Go through the document (not a raw $set) so the module subdoc is created
  // with its schema defaults if this is the first touch on this track.
  if (!user.modules.has(track)) {
    user.modules.set(track, {
      topicProgress: new Map(),
      streak: { count: 0, lastActiveDayLocal: null, lastActiveAt: null },
      xp: 0,
    });
  }
  const mod = user.modules.get(track)!;
  mod.lastVisited = { topicSlug, questionId, at: new Date() };
  user.preferredTrack = track;
  await user.save();
}

export async function getTopicProgress(
  clerkId: string,
  track: TrackSlug,
  topicSlug: string,
): Promise<{
  status: string;
  currentQuestionId: string | null;
  completedQuestionIds: string[];
} | null> {
  await connectMongo();
  const user = await User.findOne({ clerkId });
  if (!user) return null;
  const mod = user.modules.get(track);
  if (!mod) return null;
  const ts = mod.topicProgress.get(topicSlug);
  if (!ts) return null;
  return {
    status: ts.status,
    currentQuestionId: ts.currentQuestionId ?? null,
    completedQuestionIds: [...ts.completedQuestionIds],
  };
}
