import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Binary,
  BookOpen,
  Flame,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import type { AppUser } from "@/lib/auth";
import {
  getQuestionById,
  getQuestionsForTopic,
  getTopicBySlug,
  getTopicsByTrack,
} from "@/lib/catalog";
import { getMicrogradModule, getZeroToHeroCourse } from "@/lib/project-catalog";
import { getTrackProgressSnapshot } from "@/lib/progress";
import { TRACKS, type TrackSlug } from "@/lib/types";
import { cn } from "@/lib/utils";

const TRACK_DETAILS: Record<
  TrackSlug,
  {
    description: string;
    icon: LucideIcon;
    tone: string;
    topics: string[];
  }
> = {
  dsa: {
    description:
      "Practice data structures, algorithms, patterns, and interview-style problem solving.",
    icon: Binary,
    tone: "bg-sky-100 text-sky-950 dark:bg-sky-400/15 dark:text-sky-200",
    topics: ["Arrays", "Trees", "Graphs"],
  },
  ds: {
    description:
      "Build math, statistics, Python, machine learning, and data analysis skills in order.",
    icon: BarChart3,
    tone:
      "bg-emerald-100 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-200",
    topics: ["Math", "Python", "Machine Learning"],
  },
};

const PROJECT_CARD = {
  title: "Projects",
  subtitle: "Build real things step by step",
  description:
    "Use projects when you want to learn by building. Pick a track, clone the repo, follow the tasks, and use the tutor when you get stuck.",
  topics: ["Repos", "Tests", "Tutor"],
  youtubeVideoId: "VMj-3S1tku0",
};

function getTrackStats(track: TrackSlug) {
  const topics = getTopicsByTrack(track);
  const moduleCount = new Set(topics.map((topic) => topic.step_no)).size;
  const questionCount = topics.reduce(
    (count, topic) => count + getQuestionsForTopic(track, topic.slug).length,
    0,
  );

  return { moduleCount, topicCount: topics.length, questionCount };
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-mono text-sm">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function LearningHome({ user }: { user: AppUser }) {
  const course = getZeroToHeroCourse();
  const microgradModule = getMicrogradModule();
  const liveModules = course.modules.filter((item) => item.hasContent).length;

  // Per-track progress + stats in one pass (snapshots are the user's own state).
  const trackData = await Promise.all(
    TRACKS.map(async (track) => {
      const snap = await getTrackProgressSnapshot(user.clerkId, track.slug);
      const stats = getTrackStats(track.slug);
      return { track, snap, stats, completed: snap.completedQuestionIds.size };
    }),
  );

  // Resume target = the most recently visited problem across all tracks.
  const resumeEntry =
    trackData
      .filter((d) => d.snap.lastVisited)
      .sort(
        (a, b) =>
          b.snap.lastVisited!.at.getTime() - a.snap.lastVisited!.at.getTime(),
      )[0] ?? null;

  const resume = resumeEntry
    ? {
        href: `/${resumeEntry.track.slug}/tutor/${resumeEntry.snap.lastVisited!.topicSlug}/${resumeEntry.snap.lastVisited!.questionId}`,
        questionTitle:
          getQuestionById(resumeEntry.snap.lastVisited!.questionId)
            ?.question_title ?? "your last problem",
        topicTitle:
          getTopicBySlug(
            resumeEntry.track.slug,
            resumeEntry.snap.lastVisited!.topicSlug,
          )?.title ?? resumeEntry.snap.lastVisited!.topicSlug,
        trackTitle: resumeEntry.track.title,
        streak: resumeEntry.snap.streak.count,
      }
    : null;

  const totalXp = trackData.reduce((sum, d) => sum + d.snap.xp, 0);
  const resumeStreak = resume?.streak ?? 0;
  const hasProgress = resume !== null || trackData.some((d) => d.completed > 0);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      {/* COPY: eyebrow + heading are yours to rewrite. */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {hasProgress ? "Welcome back" : "Start learning"}
          </p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            {hasProgress
              ? "Ready for today's problem?"
              : "Choose what you want to learn today."}
          </h1>
          {!hasProgress && (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Pick a path first. Each path opens into modules, and each module
              opens into submodules, problems, and the tutor workspace.
            </p>
          )}
        </div>

        {hasProgress && (resumeStreak > 0 || totalXp > 0) && (
          <div className="flex items-center gap-4 text-sm">
            {resumeStreak > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{resumeStreak}</span>
                <span className="text-muted-foreground">day streak</span>
              </span>
            )}
            {resumeStreak > 0 && totalXp > 0 && (
              <span className="text-muted-foreground">·</span>
            )}
            {totalXp > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-medium">{totalXp}</span>
                <span className="text-muted-foreground">XP</span>
              </span>
            )}
          </div>
        )}
      </header>

      {/* One-click resume - straight into the tutor workspace, no drill-down. */}
      {resume && (
        <Link
          href={resume.href}
          className="group flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
        >
          <div className="min-w-0">
            {/* COPY: "Continue" / "Pick up where you left off" */}
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Continue
            </p>
            <h2 className="mt-1.5 truncate text-lg font-semibold tracking-tight">
              {resume.questionTitle}
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {resume.topicTitle} · {resume.trackTitle}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform group-hover:translate-x-0.5">
            Resume
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {trackData.map(({ track, stats, completed }) => {
          const detail = TRACK_DETAILS[track.slug];
          const Icon = detail.icon;
          const pct = stats.questionCount
            ? Math.min(100, Math.round((completed / stats.questionCount) * 100))
            : 0;

          return (
            <Link
              key={track.slug}
              href={`/${track.slug}`}
              className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
            >
              <div className="flex items-start justify-between gap-4">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md",
                    detail.tone,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>

              <div className="mt-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Learning path
                </p>
                <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
                  {track.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {detail.description}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {detail.topics.map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {topic}
                  </span>
                ))}
              </div>

              <div className="mt-auto pt-5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {completed > 0
                      ? `${completed} / ${stats.questionCount} solved`
                      : `${stats.questionCount} problems`}
                  </span>
                  {completed > 0 && (
                    <span className="font-mono text-muted-foreground">
                      {pct}%
                    </span>
                  )}
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
                  <Stat value={stats.moduleCount} label="modules" />
                  <Stat value={stats.topicCount} label="topics" />
                  <Stat value={stats.questionCount} label="problems" />
                </div>
              </div>
            </Link>
          );
        })}

        <Link
          href="/projects"
          className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
        >
          <div className="relative">
            <Image
              src={`https://i.ytimg.com/vi/${PROJECT_CARD.youtubeVideoId}/hqdefault.jpg`}
              alt="Project track thumbnail"
              width={480}
              height={360}
              className="h-28 w-full rounded-md border border-border object-cover"
            />
            <span className="absolute left-2 top-2 rounded-full border border-border bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
              Live now
            </span>
          </div>

          <div className="mt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Project path
            </p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
              {PROJECT_CARD.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {PROJECT_CARD.subtitle}
            </p>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {PROJECT_CARD.description}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {PROJECT_CARD.topics.map((topic) => (
              <span
                key={topic}
                className="rounded-full border border-border bg-rose-100/40 px-2 py-0.5 text-xs text-rose-900 dark:bg-rose-400/15 dark:text-rose-200"
              >
                {topic}
              </span>
            ))}
          </div>

          <div className="mt-auto pt-5">
            <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
              <Stat value={liveModules} label="modules" />
              <Stat value={microgradModule.projects.length} label="projects" />
              <Stat value={course.modules.length} label="videos" />
            </div>
          </div>
        </Link>
      </section>

      {/* First-run orientation only - returning users already know the flow. */}
      {!hasProgress && (
        <section className="grid gap-4 border-t border-border pt-8 md:grid-cols-2">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-medium">Guided modules</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The first click chooses the path. The next click chooses the
                module. Then you work through focused submodules.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ListChecks className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-medium">Progress stays separate</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                DSA and Data Science stay as separate learning paths instead of
                one becoming the default for everyone.
              </p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
