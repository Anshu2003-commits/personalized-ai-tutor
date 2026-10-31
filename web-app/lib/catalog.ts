import "server-only";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Question, Topic, TrackSlug } from "./types";

type QuestionTitleKey = `${number}|${number}|${number}`;
type DsaQuestionMetadata = Pick<
  Question,
  "step_no" | "sub_step_no" | "sl_no" | "question_title"
>;

function dsaQuestionTitleKey(q: Omit<Question, "track">): QuestionTitleKey {
  return `${q.step_no}|${q.sub_step_no}|${q.sl_no}`;
}

function loadDsaQuestionTitleByKey(): Map<QuestionTitleKey, string> {
  const path = resolve(process.cwd(), "../data/quarantine/intern-2026-06/dsa/questions.json");
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as DsaQuestionMetadata[];
  const map = new Map<QuestionTitleKey, string>();
  for (const q of parsed) {
    map.set(`${q.step_no}|${q.sub_step_no}|${q.sl_no}`, q.question_title);
  }
  return map;
}

// Source of truth lives in the monorepo root at data/courses/{trackSlug}/questions.json.
// Read once at module init, in-memory thereafter.
function loadTrack(track: TrackSlug): Question[] {
  const path = resolve(
    process.cwd(),
    `../data/courses/${track}/questions.json`,
  );
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as Omit<Question, "track">[];
  const dsaQuestionTitleByKey =
    track === "dsa" ? loadDsaQuestionTitleByKey() : null;
  return parsed.map((q) => ({
    ...q,
    track,
    question_title:
      track === "dsa"
        ? dsaQuestionTitleByKey?.get(dsaQuestionTitleKey(q)) ??
          q.question_title
        : q.question_title,
  }));
}

const questions: Question[] = [...loadTrack("dsa"), ...loadTrack("ds")];

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const topicsByKey = new Map<string, Topic>();
for (const q of questions) {
  const slug = toSlug(q.sub_step_title);
  const key = `${q.track}::${slug}`;
  let topic = topicsByKey.get(key);
  if (!topic) {
    topic = {
      slug,
      track: q.track,
      step_no: q.step_no,
      sub_step_no: q.sub_step_no,
      step_title: q.step_title,
      title: q.sub_step_title,
      question_ids: [],
    };
    topicsByKey.set(key, topic);
  }
  topic.question_ids.push(q.question_id);
}

const topicsByTrack = new Map<TrackSlug, Topic[]>();
for (const topic of topicsByKey.values()) {
  const list = topicsByTrack.get(topic.track) ?? [];
  list.push(topic);
  topicsByTrack.set(topic.track, list);
}
for (const list of topicsByTrack.values()) {
  list.sort((a, b) => a.step_no - b.step_no || a.sub_step_no - b.sub_step_no);
}

const questionById = new Map(questions.map((q) => [q.question_id, q]));

// Sort each topic's question_ids by sl_no so "first question" navigation lands
// on the catalog-ordered first question of the sub-step.
for (const topic of topicsByKey.values()) {
  topic.question_ids.sort(
    (a, b) =>
      (questionById.get(a)?.sl_no ?? 0) - (questionById.get(b)?.sl_no ?? 0),
  );
}

export function getTopicsByTrack(track: TrackSlug): Topic[] {
  return topicsByTrack.get(track) ?? [];
}

export function getTopicBySlug(
  track: TrackSlug,
  slug: string,
): Topic | undefined {
  return topicsByKey.get(`${track}::${slug}`);
}

export function getQuestionById(id: string): Question | undefined {
  return questionById.get(id);
}

export function getQuestionsForTopic(
  track: TrackSlug,
  slug: string,
): Question[] {
  const t = getTopicBySlug(track, slug);
  if (!t) return [];
  return t.question_ids
    .map((id) => questionById.get(id))
    .filter((q): q is Question => Boolean(q));
}

/** Used for generateStaticParams - returns every topic across all tracks. */
export function getAllTopicsFlat(): Topic[] {
  return Array.from(topicsByKey.values());
}

export function getAllQuestionsFlat(): Question[] {
  return questions;
}
