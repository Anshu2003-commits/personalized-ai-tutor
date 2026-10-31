import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  getQuestionById,
  getQuestionsForTopic,
  getTopicBySlug,
  getTopicsByTrack,
} from "@/lib/catalog";
import {
  getTrackProgressSnapshot,
  type TrackProgressSnapshot,
} from "@/lib/progress";
import {
  TRACKS,
  type Difficulty,
  type Question,
  type Topic,
  type TrackSlug,
} from "@/lib/types";
import { tutorPath } from "@/lib/seo";
import { cn } from "@/lib/utils";

type Props = { track: TrackSlug; module?: string };

const DIFF: Record<Difficulty, { label: string; text: string }> = {
  easy: { label: "Easy", text: "text-emerald-400" },
  medium: { label: "Med.", text: "text-amber-400" },
  hard: { label: "Hard", text: "text-rose-400" },
};

function diffOf(d: string | undefined): Difficulty {
  return d === "easy" || d === "medium" || d === "hard" ? d : "medium";
}

function ProgressBar({
  value,
  total,
  className,
}: {
  value: number;
  total: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className={cn("h-1 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="h-full rounded-full bg-emerald-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type ModuleSection = { topic: Topic; questions: Question[]; solved: number };
type Module = {
  stepNo: number;
  title: string;
  sections: ModuleSection[];
  total: number;
  solved: number;
  easy: number;
  medium: number;
  hard: number;
};

export default async function TrackRoadmap({ track, module }: Props) {
  const meta = TRACKS.find((t) => t.slug === track);
  const topics = getTopicsByTrack(track);

  const { userId } = await auth();
  // Best-effort: anonymous users (and any progress-store hiccup) get the same
  // page with zero states, never an error.
  let snapshot: TrackProgressSnapshot | null = null;
  if (userId) {
    try {
      snapshot = await getTrackProgressSnapshot(userId, track);
    } catch {
      snapshot = null;
    }
  }

  if (topics.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
        <header>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Track
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {meta?.tagline ?? track}
          </h1>
        </header>
        <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
          No content loaded for this track yet.
        </div>
      </main>
    );
  }

  const completedSet = snapshot?.completedQuestionIds ?? new Set<string>();
  const starredSet = snapshot?.starredQuestionIds ?? new Set<string>();

  const stepMap = new Map<number, { step_title: string; topics: Topic[] }>();
  for (const t of topics) {
    const entry = stepMap.get(t.step_no) ?? {
      step_title: t.step_title,
      topics: [],
    };
    entry.topics.push(t);
    stepMap.set(t.step_no, entry);
  }

  const modules: Module[] = Array.from(stepMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([stepNo, { step_title, topics: stepTopics }]) => {
      const sections: ModuleSection[] = stepTopics.map((t) => ({
        topic: t,
        questions: getQuestionsForTopic(track, t.slug),
        solved: snapshot?.topics.get(t.slug)?.completedCount ?? 0,
      }));
      let total = 0;
      let solved = 0;
      let easy = 0;
      let medium = 0;
      let hard = 0;
      for (const s of sections) {
        total += s.questions.length;
        for (const q of s.questions) {
          if (completedSet.has(q.question_id)) solved += 1;
          const d = diffOf(q.difficulty);
          if (d === "easy") easy += 1;
          else if (d === "medium") medium += 1;
          else hard += 1;
        }
      }
      return {
        stepNo,
        title: step_title,
        sections,
        total,
        solved,
        easy,
        medium,
        hard,
      };
    });

  const selectedModuleNo = module ? Number(module) : null;
  const selectedModule =
    selectedModuleNo && Number.isInteger(selectedModuleNo)
      ? modules.find((m) => m.stepNo === selectedModuleNo)
      : null;

  // Continue / start card - three variants: resume lastVisited, signed-in
  // first question, anonymous first topic.
  const firstTopic = topics[0];
  const firstQuestion = getQuestionById(firstTopic.question_ids[0] ?? "");
  const lv = snapshot?.lastVisited ?? null;
  const lvQuestion = lv ? getQuestionById(lv.questionId) : undefined;
  const lvTopic = lv ? getTopicBySlug(track, lv.topicSlug) : undefined;
  // "Last opened" markers - the module/submodule/question the user last touched.
  const lvStepNo = lvTopic?.step_no ?? null;
  const lvInSelectedModule =
    selectedModule != null &&
    lvStepNo !== null &&
    selectedModule.stepNo === lvStepNo;

  let card: {
    eyebrow: string;
    title: string;
    topicTitle: string;
    difficulty: Difficulty | null;
    href: string;
    cta: string;
  };
  if (userId && lvQuestion && lvTopic) {
    card = {
      eyebrow: "Continue where you left off",
      title: lvQuestion.question_title,
      topicTitle: lvTopic.title,
      difficulty: diffOf(lvQuestion.difficulty),
      href: tutorPath(track, lvTopic.slug, lvQuestion.question_id),
      cta: "Resume",
    };
  } else if (userId && firstQuestion) {
    card = {
      eyebrow: "Start here",
      title: firstQuestion.question_title,
      topicTitle: firstTopic.title,
      difficulty: diffOf(firstQuestion.difficulty),
      href: tutorPath(track, firstTopic.slug, firstQuestion.question_id),
      cta: "Start",
    };
  } else {
    card = {
      eyebrow: "Get started",
      title: `Start with ${modules[0].title}`,
      topicTitle: firstTopic.title,
      difficulty: null,
      href: `/${track}/tutor/${firstTopic.slug}`,
      cta: "Start",
    };
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <section className="rounded-lg border border-border bg-card px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {card.eyebrow}
            </p>
            <p className="mt-1.5 truncate text-sm font-medium tracking-tight">
              {card.title}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {card.topicTitle}
              {card.difficulty && (
                <>
                  {" · "}
                  <span className={DIFF[card.difficulty].text}>
                    {DIFF[card.difficulty].label}
                  </span>
                </>
              )}
            </p>
          </div>
          <Link
            href={card.href}
            prefetch
            className={cn(buttonVariants(), "shrink-0")}
          >
            {card.cta}
          </Link>
        </div>
      </section>

      {!selectedModule ? (
        <section className="grid gap-4 md:grid-cols-2">
          {modules.map((m) => {
            const pct =
              m.total > 0 ? Math.round((m.solved / m.total) * 100) : 0;
            const topicPreview = m.sections.slice(0, 4);
            const isCurrent = lvStepNo !== null && m.stepNo === lvStepNo;

            return (
              <Link
                key={m.stepNo}
                href={`/${track}?module=${m.stepNo}`}
                className={cn(
                  "group flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/30",
                  isCurrent &&
                    "border-foreground/40 ring-1 ring-inset ring-foreground/30",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        Module {String(m.stepNo).padStart(2, "0")}
                      </p>
                      {isCurrent && (
                        <span className="rounded-full bg-foreground px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-background">
                          Last opened
                        </span>
                      )}
                    </div>
                    <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
                      {m.title}
                    </h2>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {topicPreview.map(({ topic }) => (
                    <span
                      key={topic.slug}
                      className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {topic.title}
                    </span>
                  ))}
                  {m.sections.length > topicPreview.length && (
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                      +{m.sections.length - topicPreview.length} more
                    </span>
                  )}
                </div>

                <div className="mt-auto pt-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-xs text-muted-foreground">
                      {m.solved}/{m.total} solved
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {pct}%
                    </span>
                  </div>
                  <ProgressBar
                    value={m.solved}
                    total={m.total}
                    className="mt-2.5"
                  />
                  <div className="mt-4 flex items-center gap-3 border-t border-border pt-3 font-mono text-[11px]">
                    <span className="text-emerald-400">{m.easy} easy</span>
                    <span className="text-amber-400">{m.medium} med.</span>
                    <span className="text-rose-400">{m.hard} hard</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/${track}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to modules
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Module {String(selectedModule.stepNo).padStart(2, "0")} ·{" "}
              {selectedModule.solved}/{selectedModule.total}
            </span>
          </div>

          <div className="rounded-md border border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Module {String(selectedModule.stepNo).padStart(2, "0")}
              </span>
              <h2 className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">
                {selectedModule.title}
              </h2>
              <span className="font-mono text-[10px] text-muted-foreground">
                {selectedModule.solved}/{selectedModule.total}
              </span>
              <ProgressBar
                value={selectedModule.solved}
                total={selectedModule.total}
                className="w-16"
              />
              <span className="hidden items-center gap-1.5 font-mono text-[10px] sm:flex">
                <span className="text-emerald-400">{selectedModule.easy}</span>
                <span className="text-amber-400">
                  {selectedModule.medium}
                </span>
                <span className="text-rose-400">{selectedModule.hard}</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {selectedModule.sections.map(
              ({ topic, questions, solved }) => (
                <details
                  key={topic.slug}
                  open={lvInSelectedModule && topic.slug === lv?.topicSlug}
                  className={cn(
                    "group rounded-md border border-border",
                    topic.slug === lv?.topicSlug &&
                      "border-foreground/40 ring-1 ring-inset ring-foreground/30",
                  )}
                >
                  <summary className="flex cursor-pointer list-none select-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
                    {track === "dsa" ? (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">
                        {topic.title}
                      </span>
                    ) : (
                      <>
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          Submodule {String(topic.sub_step_no).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">
                          {topic.title}
                        </span>
                      </>
                    )}
                    {topic.slug === lv?.topicSlug && (
                      <span className="shrink-0 rounded-full bg-foreground px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-background">
                        Last opened
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {solved}/{questions.length}
                    </span>
                  </summary>

                  <div className="border-t border-border">
                    <ul className="divide-y divide-border/60">
                      {questions.map((q) => {
                        const isSolved = completedSet.has(q.question_id);
                        const isCurrentQuestion = lv?.questionId === q.question_id;
                        const diff = DIFF[diffOf(q.difficulty)];
                        return (
                          <li key={q.question_id}>
                            <Link
                              href={tutorPath(
                                track,
                                topic.slug,
                                q.question_id,
                              )}
                              prefetch={false}
                              className={cn(
                                "flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent",
                                isCurrentQuestion && "bg-accent",
                              )}
                            >
                              {isSolved ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                              )}
                              <span className="w-7 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                                {q.sl_no}
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {q.question_title}
                              </span>
                              {starredSet.has(q.question_id) && (
                                <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                              )}
                              {q.has_code === false && (
                                <Badge
                                  variant="outline"
                                  className="h-4 shrink-0 px-1.5 font-mono text-[10px] text-muted-foreground"
                                >
                                  concept
                                </Badge>
                              )}
                              <span
                                className={cn(
                                  "w-10 shrink-0 text-right font-mono text-[11px]",
                                  diff.text,
                                )}
                              >
                                {diff.label}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </details>
              ),
            )}
          </div>
        </section>
      )}
    </main>
  );
}
