"use client";

import Link from "next/link";
import {
  type ReactNode,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookText,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  Flag,
  FlaskConical,
  Flame,
  Keyboard,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Lock,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Rows3,
  ShieldCheck,
  SquareCode,
  Star,
  Tag,
  ThumbsUp,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import {
  type ImperativePanelHandle,
  type ImperativePanelGroupHandle,
} from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import ChatPanel from "@/components/chat-panel";
import Markdown from "@/components/markdown";
import TutorWorkspace, {
  type EditorCodeSnapshot,
} from "@/components/tutor-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useProgress, type CompletionResult } from "@/hooks/use-progress";
import { useQuestion } from "@/hooks/use-question";
import { useTutorSettings } from "@/hooks/use-tutor-settings";
import { normalizeExample, type NormalizedExample } from "@/lib/examples";
import { prefetchQuestion } from "@/lib/question-loader";
import { tutorPath } from "@/lib/seo";
import type {
  Difficulty,
  Question,
  QuestionMeta,
  SolutionApproach,
  TrackSlug,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  track: TrackSlug;
  topicSlug: string;
  topicTitle: string;
  /** Ordered question metadata for the topic (real titles + difficulty). */
  questions: QuestionMeta[];
  initialQuestionId: string;
};

type LeftTab = "description" | "solutions" | "resources";
type PaneId = "problem" | "mentor" | "editor";

type ResourceType =
  | "video"
  | "article"
  | "documentation"
  | "paper"
  | "discussion"
  | "hint"
  | "solution";

type ResourceCommentRow = {
  id: string;
  resourceId: string;
  parentCommentId: string | null;
  text: string;
  createdByName: string;
  isAdmin: boolean;
  upvoteCount: number;
  viewerUpvoted: boolean;
  createdAt: string;
};

type ResourceRow = {
  id: string;
  url: string;
  title: string;
  description: string | null;
  siteName: string | null;
  domain: string;
  thumbnailUrl: string | null;
  provider: string;
  youtubeVideoId: string | null;
  type: ResourceType;
  status: "active" | "hidden" | "deleted";
  verified: boolean;
  createdByName: string;
  upvoteCount: number;
  reportCount: number;
  viewerUpvoted: boolean;
  viewerReported: boolean;
  createdAt: string;
  comments: ResourceCommentRow[];
};

// Traffic-light difficulty, mapped onto readable accents.
const DIFF: Record<Difficulty, { label: string; text: string; dot: string }> = {
  easy: { label: "Easy", text: "text-emerald-400", dot: "bg-emerald-500" },
  medium: { label: "Medium", text: "text-amber-400", dot: "bg-amber-500" },
  hard: { label: "Hard", text: "text-rose-400", dot: "bg-rose-500" },
};

function diffOf(d: string | undefined): Difficulty {
  return d === "easy" || d === "medium" || d === "hard" ? d : "medium";
}

const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: "video", label: "Video" },
  { value: "article", label: "Article" },
  { value: "documentation", label: "Docs" },
  { value: "paper", label: "Paper" },
  { value: "discussion", label: "Discussion" },
  { value: "hint", label: "Hint" },
  { value: "solution", label: "Solution" },
];

// Layout presets for the tutor workspace. Default keeps the learning loop as
// problem + code/testcase + tutor.
type LayoutId = "default" | "focusCode" | "focusProblem" | "focusTutor";
const LAYOUTS: Record<
  LayoutId,
  { label: string; weights: Record<PaneId, number> }
> = {
  default: {
    label: "Default",
    weights: { problem: 34, mentor: 24, editor: 42 },
  },
  focusCode: {
    label: "Focus code",
    weights: { problem: 24, mentor: 18, editor: 58 },
  },
  focusProblem: {
    label: "Read",
    weights: { problem: 58, mentor: 18, editor: 24 },
  },
  focusTutor: {
    label: "Tutor",
    weights: { problem: 24, mentor: 46, editor: 30 },
  },
};

const RAIL_SIZE = 2;

// Panel order as rendered in the group - getLayout()/setLayout() arrays are
// indexed in this order, so any imperative layout must follow it.
const PANE_ORDER: PaneId[] = ["problem", "editor", "mentor"];

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "[", label: "Previous question" },
  { keys: "]", label: "Next question" },
  { keys: "1", label: "Minimize / restore problem" },
  { keys: "2", label: "Minimize / restore tutor" },
  { keys: "3", label: "Minimize / restore code" },
  { keys: "q", label: "Question list" },
  { keys: "?", label: "This cheat-sheet" },
];

// Sub-frame crossfade on content swaps where supported; instant fallback else.
function withViewTransition(run: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => void;
  };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => flushSync(run));
  } else {
    run();
  }
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function firstSentence(s: string): string {
  const t = s.trim();
  const m = t.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : t).trim();
}

export default function TutorView({
  track,
  topicSlug,
  topicTitle,
  questions,
  initialQuestionId,
}: Props) {
  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);

  const [currentId, setCurrentId] = useState<string | null>(() => {
    return questionIds.includes(initialQuestionId)
      ? initialQuestionId
      : (questionIds[0] ?? null);
  });
  const [progress, setProgress] = useState<CompletionResult>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>("description");
  const [navOpen, setNavOpen] = useState(false);
  const [cheatOpen, setCheatOpen] = useState(false);

  // Pane layout state. `minimized` collapses a pane to a thin rail (state kept,
  // since panes stay mounted). `maximized` makes one pane fill the workspace.
  const [minimized, setMinimized] = useState<Record<PaneId, boolean>>({
    problem: false,
    mentor: false,
    editor: false,
  });
  const [maximized, setMaximized] = useState<PaneId | null>(null);
  const [layout, setLayout] = useState<LayoutId>("default");

  const { isSignedIn, isLoaded } = useAuth();
  const { data: current, error } = useQuestion(currentId);
  const { completedIds, streak, markComplete } = useProgress(track, topicSlug);
  const { shortcutsEnabled, setShortcutsEnabled } = useTutorSettings();

  // Stars: optimistic local set, hydrated once for signed-in users.
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  // Solutions blur-gate reveal, per question, this mount only.
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  // Community resources cache + the version counter mutations bump.
  const [resources, setResources] = useState<ResourceRow[] | null>(null);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesVersion, setResourcesVersion] = useState(0);
  const resourcesKeyRef = useRef<string | null>(null);

  const groupRef = useRef<ImperativePanelGroupHandle>(null);
  const problemRef = useRef<ImperativePanelHandle>(null);
  const mentorRef = useRef<ImperativePanelHandle>(null);
  const editorRef = useRef<ImperativePanelHandle>(null);
  const editorSnapshotRef = useRef<EditorCodeSnapshot | null>(null);
  const refs = useMemo(
    () => ({ problem: problemRef, mentor: mentorRef, editor: editorRef }),
    [],
  );

  const index = currentId ? questionIds.indexOf(currentId) : -1;
  const difficulty = diffOf(current?.difficulty);
  const approaches = current?.solution_approaches ?? [];
  const referenceSolution = current?.solution?.trim() ? current.solution : null;
  const showSolutionsTab = approaches.length > 0 || referenceSolution !== null;
  const effectiveTab: LeftTab =
    leftTab === "solutions" && !showSolutionsTab ? "description" : leftTab;

  // Prefetch a window around the current question so adjacent switches are
  // instant without fanning out 40+ fetches on large topics. The loader
  // dedupes via its inflight map + IDB cache, so re-runs are cheap.
  useEffect(() => {
    const i = currentId ? questionIds.indexOf(currentId) : 0;
    for (const j of [i - 1, i + 1, i + 2, i + 3]) {
      const id = questionIds[j];
      if (id && id !== currentId) prefetchQuestion(id);
    }
  }, [questionIds, currentId]);

  // Load the starred set once auth resolves. Best-effort; anonymous users
  // simply keep an in-session local set.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    fetch("/api/user/stars")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.starred) setStarredIds(new Set(data.starred));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  // Visited tracking - fire-and-forget so "continue where you left off" works.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !currentId) return;
    fetch("/api/user/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "visited",
        track,
        topicSlug,
        questionId: currentId,
      }),
    }).catch(() => {});
  }, [isLoaded, isSignedIn, currentId, track, topicSlug]);

  // Community resources: fetch on first open of the tab for this question, and
  // re-fetch when a resource/comment/vote mutation bumps the version.
  useEffect(() => {
    if (effectiveTab !== "resources" || !currentId) return;
    const key = `${currentId}:${resourcesVersion}`;
    if (resourcesKeyRef.current === key) return;
    resourcesKeyRef.current = key;
    let cancelled = false;
    setResourcesLoading(true);
    fetch(`/api/resources?questionId=${encodeURIComponent(currentId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setResources(data.resources ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResourcesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveTab, currentId, resourcesVersion]);

  const showEditor = current !== null && (current.has_code ?? true);

  useEffect(() => {
    editorSnapshotRef.current = null;
  }, [currentId]);

  const handleEditorSnapshotChange = useCallback((snapshot: EditorCodeSnapshot) => {
    editorSnapshotRef.current = snapshot;
  }, []);

  const getEditorSnapshot = useCallback(() => {
    const snapshot = editorSnapshotRef.current;
    if (!snapshot || snapshot.questionId !== current?.question_id) return null;
    return snapshot;
  }, [current?.question_id]);

  const handleQuestionCompleted = useCallback(async () => {
    if (!current) return;
    const r = await markComplete(current.question_id);
    if (r) setProgress(r);
  }, [current, markComplete]);

  const toggleStar = useCallback((questionId: string) => {
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    fetch("/api/user/stars", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId }),
    }).catch(() => {});
  }, []);

  const revealSolutions = useCallback(() => {
    if (!currentId) return;
    setRevealedIds((prev) => new Set(prev).add(currentId));
  }, [currentId]);

  const goToQuestion = useCallback(
    (id: string | null, updateUrl = true) => {
      if (!id) return;
      withViewTransition(() => {
        setCurrentId(id);
        setProgress(null);
        setLeftTab("description"); // new question always opens on the description
        setResources(null);
      });
      if (updateUrl) {
        window.history.pushState(null, "", tutorPath(track, topicSlug, id));
      }
    },
    [track, topicSlug],
  );

  useEffect(() => {
    function onPopState() {
      const path = window.location.pathname.split("/").filter(Boolean);
      const id = path[3];
      goToQuestion(id && questionIds.includes(id) ? id : questionIds[0], false);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [goToQuestion, questionIds]);

  const goPrev = useCallback(() => {
    if (index > 0) goToQuestion(questionIds[index - 1]);
  }, [index, questionIds, goToQuestion]);

  const goNext = useCallback(() => {
    if (index >= 0 && index < questionIds.length - 1)
      goToQuestion(questionIds[index + 1]);
  }, [index, questionIds, goToQuestion]);

  // --- layout application -------------------------------------------------

  // Apply a preset's weights, honoring minimized panes (which get rail size).
  const applyLayout = useCallback(
    (id: LayoutId, mins: Record<PaneId, boolean>) => {
      const base = LAYOUTS[id].weights;
      const open = (Object.keys(base) as PaneId[]).filter((k) => !mins[k]);
      const totalOpen = open.reduce((s, k) => s + base[k], 0) || 1;
      const railBudget =
        (Object.keys(base) as PaneId[]).filter((k) => mins[k]).length *
        RAIL_SIZE;
      const openBudget = Math.max(20, 100 - railBudget);
      for (const k of Object.keys(base) as PaneId[]) {
        const handle = refs[k].current;
        if (!handle) continue;
        if (mins[k]) {
          handle.resize(RAIL_SIZE);
        } else {
          handle.resize((base[k] / totalOpen) * openBudget);
        }
      }
    },
    [refs],
  );

  const chooseLayout = useCallback(
    (id: LayoutId) => {
      setMaximized(null);
      const reset: Record<PaneId, boolean> = {
        problem: false,
        mentor: false,
        editor: false,
      };
      setMinimized(reset);
      setLayout(id);
      requestAnimationFrame(() => applyLayout(id, reset));
    },
    [applyLayout],
  );

  // Minimize a pane to its rail (keep >=1 open). Toggle restores it.
  const toggleMinimize = useCallback(
    (id: PaneId) => {
      const restoreMins = preMaximizeMins.current ?? {
        problem: false,
        mentor: false,
        editor: false,
      };
      if (maximized) {
        const next = { ...restoreMins, [id]: true };
        preMaximizeMins.current = null;
        setMaximized(null);
        setMinimized(next);
        requestAnimationFrame(() => applyLayout(layout, next));
        return;
      }
      setMaximized(null);
      setMinimized((prev) => {
        const wantMin = !prev[id];
        if (wantMin) {
          const openCount = (Object.keys(prev) as PaneId[]).filter(
            (k) => !prev[k],
          ).length;
          if (openCount <= 1) return prev; // never minimize the last open pane
        }
        const next = { ...prev, [id]: wantMin };
        requestAnimationFrame(() => applyLayout(layout, next));
        return next;
      });
    },
    [applyLayout, layout, maximized],
  );

  // Maximize one pane to fill the workspace; click again to restore. We snapshot
  // the live layout (exact pane sizes, incl. manual drags) and the minimized
  // states before maximizing, then restore them verbatim via the group's
  // setLayout - order-independent and atomic, unlike per-pane delta resizes.
  // Side effects stay out of the setState updater so StrictMode's double-invoke
  // can't schedule them twice and clobber the snapshot.
  const preMaximizeMins = useRef<Record<PaneId, boolean> | null>(null);
  const preMaximizeLayout = useRef<number[] | null>(null);
  const toggleMaximize = useCallback(
    (id: PaneId) => {
      if (maximized === id) {
        // Restore to the exact pre-maximize state.
        const layoutSnap = preMaximizeLayout.current;
        const mins = preMaximizeMins.current ?? {
          problem: false,
          mentor: false,
          editor: false,
        };
        setMaximized(null);
        requestAnimationFrame(() => {
          preMaximizeLayout.current = null;
          preMaximizeMins.current = null;
          setMinimized(mins);
          if (layoutSnap) groupRef.current?.setLayout(layoutSnap);
          else applyLayout(layout, mins);
        });
        return;
      }
      // Snapshot the live layout + minimized state once, so a later restore
      // returns to exactly here (don't overwrite when switching maximized panes).
      const firstMaximize = !maximized;
      const layoutSnap = firstMaximize
        ? (groupRef.current?.getLayout() ?? null)
        : null;
      const minsSnap = minimized;
      const railBudget = (PANE_ORDER.length - 1) * RAIL_SIZE;
      const nextLayout = PANE_ORDER.map((k) =>
        k === id ? 100 - railBudget : RAIL_SIZE,
      );
      setMaximized(id);
      requestAnimationFrame(() => {
        if (firstMaximize) {
          preMaximizeLayout.current = layoutSnap;
          preMaximizeMins.current = minsSnap;
        }
        setMinimized({
          problem: id !== "problem",
          mentor: id !== "mentor",
          editor: id !== "editor",
        });
        groupRef.current?.setLayout(nextLayout);
      });
    },
    [applyLayout, layout, maximized, minimized],
  );

  // Focus Mode - collapse to the editor with side panes kept as rails.
  const enterFocusMode = useCallback(() => {
    toggleMaximize("editor");
  }, [toggleMaximize]);

  // Keyboard shortcuts (opt-out via settings). Ignored while typing.
  useEffect(() => {
    if (!shortcutsEnabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case "[":
          goPrev();
          break;
        case "]":
          goNext();
          break;
        case "1":
          toggleMinimize("problem");
          break;
        case "2":
          toggleMinimize("mentor");
          break;
        case "3":
          toggleMinimize("editor");
          break;
        case "q":
          setNavOpen((o) => !o);
          break;
        case "?":
          setCheatOpen((o) => !o);
          break;
        case "Escape":
          setCheatOpen(false);
          setNavOpen(false);
          if (maximized) toggleMaximize(maximized);
          break;
        default:
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutsEnabled, goPrev, goNext, toggleMinimize, toggleMaximize, maximized]);

  const solved = progress !== null;

  // Window controls for a pane header (minimize + maximize/restore).
  const paneControls = (id: PaneId) => (
    <PaneControls
      isMaximized={maximized === id}
      onMinimize={() => toggleMinimize(id)}
      onMaximize={() => toggleMaximize(id)}
    />
  );

  return (
    <div className="tutor-scrollbars flex h-dvh flex-col bg-background text-foreground">
      {/* ============================ top bar ============================ */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          className="group flex h-8 items-center gap-2 rounded-md border border-border bg-background pl-2 pr-2.5 text-sm font-medium transition-colors hover:bg-accent"
          title="Question list (q)"
        >
          <ListChecks className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          <span className="tabular-nums">
            <span className="font-semibold">{completedIds.size}</span>
            <span className="text-muted-foreground"> / {questionIds.length}</span>
          </span>
        </button>

        <div className="flex items-center">
          <button
            type="button"
            onClick={goPrev}
            disabled={index <= 0}
            title="Previous question ([)"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={index < 0 || index >= questionIds.length - 1}
            title="Next question (])"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

        <Link
          href={`/${track}`}
          className="hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:flex"
        >
          <span className="font-mono text-xs uppercase tracking-wider">
            {track}
          </span>
          <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
          <span className="truncate font-medium text-foreground">
            {topicTitle}
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {streak && streak.count > 0 ? (
            <span className="flex h-8 items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 text-sm font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
              <Flame className="h-4 w-4" />
              <span className="tabular-nums">{streak.count}</span>
            </span>
          ) : null}

          <Stopwatch />

          <LayoutMenu
            current={layout}
            minimized={minimized}
            maximized={maximized}
            onChoose={chooseLayout}
            onFocusMode={enterFocusMode}
          />

          <SettingsMenu
            shortcutsEnabled={shortcutsEnabled}
            onShortcutsChange={setShortcutsEnabled}
            onOpenCheat={() => setCheatOpen(true)}
          />
        </div>
      </header>

      {/* ============================ body ============================ */}
      <main className="min-h-0 flex-1 bg-background p-2">
        <ResizablePanelGroup
          ref={groupRef}
          direction="horizontal"
          autoSaveId="onlearn:tutor:v4"
          className="h-full"
        >
          {/* -------- LEFT: description / solutions / resources -------- */}
          <ResizablePanel
            id="problem"
            order={1}
            ref={problemRef}
            collapsible
            collapsedSize={RAIL_SIZE}
            minSize={16}
            defaultSize={34}
            onCollapse={() =>
              setMinimized((m) => (m.problem ? m : { ...m, problem: true }))
            }
            onExpand={() =>
              setMinimized((m) => (!m.problem ? m : { ...m, problem: false }))
            }
          >
            {minimized.problem ? (
              <PaneRail
                icon={<BookText className="h-4 w-4" />}
                label="Problem"
                onClick={() => toggleMinimize("problem")}
              />
            ) : (
              <PaneCard>
                <LeftPanel
                  current={current}
                  error={error}
                  difficulty={difficulty}
                  index={index}
                  topicSlug={topicSlug}
                  total={questionIds.length}
                  solvedThis={
                    current ? completedIds.has(current.question_id) : false
                  }
                  leftTab={effectiveTab}
                  setLeftTab={setLeftTab}
                  showSolutionsTab={showSolutionsTab}
                  referenceSolution={referenceSolution}
                  solutionsRevealed={
                    current
                      ? completedIds.has(current.question_id) ||
                        revealedIds.has(current.question_id)
                      : false
                  }
                  onRevealSolutions={revealSolutions}
                  starred={current ? starredIds.has(current.question_id) : false}
                  onToggleStar={() =>
                    current && toggleStar(current.question_id)
                  }
                  isSignedIn={isSignedIn}
                  resources={resources}
                  resourcesLoading={resourcesLoading}
                  onResourcesChanged={() => setResourcesVersion((v) => v + 1)}
                  controls={paneControls("problem")}
                />
              </PaneCard>
            )}
          </ResizablePanel>

          <ResizableHandle disabled={minimized.problem} />

          {/* -------- RIGHT: editor + console (or solved card) -------- */}
          <ResizablePanel
            id="editor"
            order={2}
            ref={editorRef}
            collapsible
            collapsedSize={RAIL_SIZE}
            minSize={20}
            defaultSize={42}
            onCollapse={() =>
              setMinimized((m) => (m.editor ? m : { ...m, editor: true }))
            }
            onExpand={() =>
              setMinimized((m) => (!m.editor ? m : { ...m, editor: false }))
            }
          >
            {minimized.editor ? (
              <PaneRail
                icon={<SquareCode className="h-4 w-4" />}
                label="Code"
                onClick={() => toggleMinimize("editor")}
              />
            ) : (
              <PaneCard>
                {current === null && error ? (
                  <>
                    <PaneHeader
                      left={<HeaderLabel icon={<SquareCode className="h-4 w-4 text-emerald-500" />} text="Code" />}
                      controls={paneControls("editor")}
                    />
                    <div className="flex flex-1 items-center justify-center p-6">
                      <div className="max-w-sm rounded-lg border border-destructive/30 bg-destructive/10 px-5 py-4 text-center">
                        <p className="text-sm font-semibold text-destructive">
                          Couldn&apos;t load this question.
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {error.message ||
                            "Check your connection and try again."}
                        </p>
                      </div>
                    </div>
                  </>
                ) : current === null ? (
                  <EditorSkeleton />
                ) : solved ? (
                  <>
                    <PaneHeader
                      left={<HeaderLabel icon={<SquareCode className="h-4 w-4 text-emerald-500" />} text="Code" />}
                      controls={paneControls("editor")}
                    />
                    <SolvedCard
                      progress={progress as NonNullable<CompletionResult>}
                      track={track}
                      onNext={() =>
                        goToQuestion(
                          (progress as NonNullable<CompletionResult>)
                            .currentQuestionId,
                        )
                      }
                    />
                  </>
                ) : showEditor ? (
                  <TutorWorkspace
                    key={current.question_id}
                    track={track}
                    questionId={current.question_id}
                    topicSlug={topicSlug}
                    structure={current.structure}
                    starterCode={current.starter_code}
                    testCases={current.test_cases ?? []}
                    onQuestionCompleted={handleQuestionCompleted}
                    onEditorSnapshotChange={handleEditorSnapshotChange}
                    paneControls={paneControls("editor")}
                  />
                ) : (
                  <>
                    <PaneHeader
                      left={<HeaderLabel icon={<SquareCode className="h-4 w-4 text-emerald-500" />} text="Code" />}
                      controls={paneControls("editor")}
                    />
                    <ConceptualNote
                      solvedThis={completedIds.has(current.question_id)}
                      onComplete={handleQuestionCompleted}
                    />
                  </>
                )}
              </PaneCard>
            )}
          </ResizablePanel>

          <ResizableHandle disabled={minimized.mentor} />

          {/* -------- FAR RIGHT: tutor side panel -------- */}
          <ResizablePanel
            id="mentor"
            order={3}
            ref={mentorRef}
            collapsible
            collapsedSize={RAIL_SIZE}
            minSize={16}
            defaultSize={24}
            onCollapse={() =>
              setMinimized((m) => (m.mentor ? m : { ...m, mentor: true }))
            }
            onExpand={() =>
              setMinimized((m) => (!m.mentor ? m : { ...m, mentor: false }))
            }
          >
            {minimized.mentor ? (
              <PaneRail
                icon={<MessageSquare className="h-4 w-4" />}
                label="Tutor"
                onClick={() => toggleMinimize("mentor")}
              />
            ) : (
              <PaneCard>
                <PaneHeader
                  left={
                    <span className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      <span className="text-xs font-medium text-foreground">
                        Tutor
                      </span>
                    </span>
                  }
                  controls={paneControls("mentor")}
                />
                <div className="min-h-0 flex-1">
                  {current ? (
                    <ChatPanel
                      questionId={current.question_id}
                      module={track}
                      getEditorSnapshot={getEditorSnapshot}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      <span className="animate-pulse">Waking the tutor…</span>
                    </div>
                  )}
                </div>
              </PaneCard>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      {/* ============================ navigator drawer ============================ */}
      <NavigatorDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        questions={questions}
        currentId={currentId}
        completedIds={completedIds}
        topicTitle={topicTitle}
        track={track}
        onSelect={(id) => {
          setNavOpen(false);
          goToQuestion(id);
        }}
      />

      {/* ============================ cheat sheet ============================ */}
      {cheatOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] animate-in fade-in-0 duration-150"
          onClick={() => setCheatOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Keyboard shortcuts"
            onClick={(e) => e.stopPropagation()}
            className="w-80 rounded-lg border border-border bg-card p-4 shadow-xl shadow-black/40 animate-in fade-in-0 zoom-in-95 duration-150"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Keyboard shortcuts</p>
              <Kbd>?</Kbd>
            </div>
            <ul className="space-y-2">
              {SHORTCUTS.map((s) => (
                <li
                  key={s.keys}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-muted-foreground">{s.label}</span>
                  <Kbd>{s.keys}</Kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* ====================================================================== */
/* pane chrome: header, window controls, minimized rail                   */
/* ====================================================================== */

function PaneHeader({
  left,
  controls,
}: {
  left: ReactNode;
  controls?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3">
      {left}
      {controls}
    </div>
  );
}

function HeaderLabel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
      {icon}
      {text}
    </span>
  );
}

function PaneControls({
  isMaximized,
  onMinimize,
  onMaximize,
}: {
  isMaximized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={onMinimize}
        title="Minimize"
        aria-label="Minimize pane"
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onMaximize}
        title={isMaximized ? "Restore" : "Maximize"}
        aria-label={isMaximized ? "Restore pane" : "Maximize pane"}
        aria-pressed={isMaximized}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-accent",
          isMaximized
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {isMaximized ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

// A minimized pane collapses to this thin, clickable rail (vertical label).
function PaneRail({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Restore ${label}`}
      aria-label={`Restore ${label}`}
      className="group flex h-full w-full flex-col items-center gap-2 rounded-md border border-border bg-card py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <span className="text-muted-foreground transition-colors group-hover:text-foreground">
        {icon}
      </span>
      <span
        className="text-[10px] font-medium tracking-wide"
        style={{ writingMode: "vertical-rl" }}
      >
        {label}
      </span>
    </button>
  );
}

/* ====================================================================== */
/* left panel (tabbed description / solutions / resources)                */
/* ====================================================================== */

function LeftPanel({
  current,
  error,
  difficulty,
  index,
  topicSlug,
  total,
  solvedThis,
  leftTab,
  setLeftTab,
  showSolutionsTab,
  referenceSolution,
  solutionsRevealed,
  onRevealSolutions,
  starred,
  onToggleStar,
  isSignedIn,
  resources,
  resourcesLoading,
  onResourcesChanged,
  controls,
}: {
  current: Question | null;
  error: Error | null;
  difficulty: Difficulty;
  index: number;
  topicSlug: string;
  total: number;
  solvedThis: boolean;
  leftTab: LeftTab;
  setLeftTab: (t: LeftTab) => void;
  showSolutionsTab: boolean;
  referenceSolution: string | null;
  solutionsRevealed: boolean;
  onRevealSolutions: () => void;
  starred: boolean;
  onToggleStar: () => void;
  isSignedIn: boolean;
  resources: ResourceRow[] | null;
  resourcesLoading: boolean;
  onResourcesChanged: () => void;
  controls?: ReactNode;
}) {
  const approaches = current?.solution_approaches ?? [];

  return (
    <>
      {/* tab strip + window controls */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 pl-2 pr-3">
        <div className="flex items-center gap-1">
          <TabButton
            active={leftTab === "description"}
            onClick={() => setLeftTab("description")}
            icon={<BookText className="h-3.5 w-3.5" />}
          >
            Description
          </TabButton>
          {showSolutionsTab && (
            <TabButton
              active={leftTab === "solutions"}
              onClick={() => setLeftTab("solutions")}
              icon={<FlaskConical className="h-3.5 w-3.5" />}
            >
              Solutions
            </TabButton>
          )}
          <TabButton
            active={leftTab === "resources"}
            onClick={() => setLeftTab("resources")}
            icon={<ExternalLink className="h-3.5 w-3.5" />}
          >
            Resources
          </TabButton>
        </div>
        {controls}
      </div>

      <div className="scrollbar-slick min-h-0 flex-1 overflow-y-auto">
        {error && !current ? (
          <p className="p-6 text-sm text-destructive">
            failed to load: {error.message}
          </p>
        ) : !current ? (
          <ProblemSkeleton />
        ) : leftTab === "solutions" ? (
          <SolutionsTab
            key={current.question_id}
            approaches={approaches}
            referenceSolution={referenceSolution}
            revealed={solutionsRevealed}
            onReveal={onRevealSolutions}
          />
        ) : leftTab === "resources" ? (
          <ResourcesTab
            key={current.question_id}
            isSignedIn={isSignedIn}
            track={current.track}
            topicSlug={topicSlug}
            current={current}
            resources={resources}
            loading={resourcesLoading}
            onChanged={onResourcesChanged}
          />
        ) : (
          <DescriptionTab
            key={current.question_id}
            current={current}
            difficulty={difficulty}
            index={index}
            total={total}
            solvedThis={solvedThis}
            starred={starred}
            onToggleStar={onToggleStar}
          />
        )}
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-9 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className={active ? "text-foreground" : ""}>{icon}</span>
      {children}
      {active && (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" />
      )}
    </button>
  );
}

/* ====================================================================== */
/* description tab                                                        */
/* ====================================================================== */

function DescriptionTab({
  current,
  difficulty,
  index,
  total,
  solvedThis,
  starred,
  onToggleStar,
}: {
  current: Question;
  difficulty: Difficulty;
  index: number;
  total: number;
  solvedThis: boolean;
  starred: boolean;
  onToggleStar: () => void;
}) {
  const example = useMemo(
    () => normalizeExample(current.example),
    [current.example],
  );
  const approaches = current.solution_approaches ?? [];

  // question_topic (one string) + concepts, deduped case-insensitively, cap 8.
  const topicChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: string[] = [];
    for (const raw of [current.question_topic, ...(current.concepts ?? [])]) {
      const label = raw?.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push(label);
      if (chips.length === 8) break;
    }
    return chips;
  }, [current.question_topic, current.concepts]);

  return (
    <article className="p-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-semibold leading-snug text-foreground">
          {index >= 0 ? `${index + 1}. ` : ""}
          {current.question_title}
        </h1>
        <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
          {solvedThis && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Solved
            </span>
          )}
          <button
            type="button"
            onClick={onToggleStar}
            title={starred ? "Unstar this question" : "Star this question"}
            aria-pressed={starred}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Star
              className={cn("h-4 w-4", starred && "fill-amber-400 text-amber-400")}
            />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-border",
            DIFF[difficulty].text,
          )}
        >
          <span
            className={cn("h-1.5 w-1.5 rounded-full", DIFF[difficulty].dot)}
          />
          {DIFF[difficulty].label}
        </span>
        {total > 1 && index >= 0 && (
          <span className="rounded-full bg-background px-2.5 py-0.5 font-mono text-xs text-muted-foreground ring-1 ring-inset ring-border">
            {index + 1} / {total}
          </span>
        )}
      </div>

      <div className="mt-5">
        <Markdown>{current.question}</Markdown>
      </div>

      {example && <ExampleBlock example={example} />}

      {(topicChips.length > 0 || approaches.length > 0) && (
        <div className="mt-8 border-b border-border">
          {topicChips.length > 0 && (
            <AccordionRow
              icon={<Tag className="h-4 w-4" />}
              label="Topics"
            >
              <div className="flex flex-wrap gap-1.5">
                {topicChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </AccordionRow>
          )}
          {approaches.map((a, i) => (
            <AccordionRow
              key={i}
              icon={<Lightbulb className="h-4 w-4" />}
              label={`Hint ${i + 1}`}
            >
              <p className="text-[13px] leading-6 text-muted-foreground">
                {hintText(a)}
              </p>
            </AccordionRow>
          ))}
        </div>
      )}
    </article>
  );
}

function hintText(a: SolutionApproach): string {
  const name = a.approach_name?.trim();
  const lead = a.explanation ? firstSentence(a.explanation) : "";
  return (
    [name, lead].filter(Boolean).join(" - ") ||
    "Sketch the approach before peeking at solutions."
  );
}

// Example block: bold field labels, monospace values.
function ExampleBlock({ example }: { example: NormalizedExample }) {
  return (
    <div className="mt-6">
      <p className="text-sm font-semibold text-foreground">Example 1:</p>
      <div className="mt-2 space-y-1 border-l-2 border-border pl-4">
        {example.input !== undefined && (
          <p className="text-[13px] leading-6">
            <span className="font-semibold text-foreground">Input: </span>
            <span className="whitespace-pre-wrap font-mono text-[12.5px] text-muted-foreground">
              {example.input}
            </span>
          </p>
        )}
        {example.output !== undefined && (
          <p className="text-[13px] leading-6">
            <span className="font-semibold text-foreground">Output: </span>
            <span className="whitespace-pre-wrap font-mono text-[12.5px] text-muted-foreground">
              {example.output}
            </span>
          </p>
        )}
        {example.explanation !== undefined && (
          <p className="text-[13px] leading-6">
            <span className="font-semibold text-foreground">Explanation: </span>
            <span className="text-muted-foreground">{example.explanation}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// Flat list-style accordion row with border and chevron.
function AccordionRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {label}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="pb-3.5">{children}</div>}
    </div>
  );
}

/* ====================================================================== */
/* solutions tab (blur-gated)                                             */
/* ====================================================================== */

function SolutionsTab({
  approaches,
  referenceSolution,
  revealed,
  onReveal,
}: {
  approaches: SolutionApproach[];
  referenceSolution: string | null;
  revealed: boolean;
  onReveal: () => void;
}) {
  const content = (
    <div className="space-y-6 p-6">
      {approaches.map((a, i) => (
        <section key={i}>
          {a.approach_name && (
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              {a.approach_name}
            </h2>
          )}
          {a.explanation && <Markdown>{a.explanation}</Markdown>}
        </section>
      ))}
      {referenceSolution && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Reference solution
            </h2>
            <CopyButton text={referenceSolution} />
          </div>
          <pre className="scrollbar-slick overflow-x-auto rounded-md border border-border bg-background px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-foreground">
            {referenceSolution}
          </pre>
        </section>
      )}
    </div>
  );

  if (revealed) return content;

  return (
    <div className="relative">
      <div
        className="pointer-events-none max-h-[420px] select-none overflow-hidden blur-sm"
        aria-hidden
      >
        {content}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="w-full max-w-xs rounded-xl border border-border bg-card px-5 py-5 text-center shadow-xl shadow-black/40">
          <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">
            Solutions are hidden
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try the tutor first - or reveal them.
          </p>
          <button
            type="button"
            onClick={onReveal}
            className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Show solutions
          </button>
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* resources tab                                                          */
/* ====================================================================== */

function ResourcesTab({
  isSignedIn,
  track,
  topicSlug,
  current,
  resources,
  loading,
  onChanged,
}: {
  isSignedIn: boolean;
  track: TrackSlug;
  topicSlug: string;
  current: Question;
  resources: ResourceRow[] | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResourceType | "all">("all");
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const visibleResources = useMemo(
    () =>
      filter === "all"
        ? (resources ?? [])
        : (resources ?? []).filter((resource) => resource.type === filter),
    [filter, resources],
  );

  if (loading && !resources) {
    return (
      <div className="animate-pulse space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-md bg-muted/70" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Resources</h2>
        <button
          type="button"
          onClick={() => {
            if (!isSignedIn) {
              setError("Sign in to upload resources.");
              return;
            }
            setError(null);
            setUploaderOpen((open) => !open);
          }}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Upload
        </button>
      </div>

      {isSignedIn && uploaderOpen ? (
        <AddResourceForm
          track={track}
          topicSlug={topicSlug}
          questionId={current.question_id}
          onError={setError}
          onCancel={() => setUploaderOpen(false)}
          onCreated={() => {
            setUploaderOpen(false);
            onChanged();
          }}
        />
      ) : null}

      {!isSignedIn && (
        <p className="text-xs text-muted-foreground">
          Sign in to upload, vote, report, or comment.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {resources && resources.length > 0 && (
        <div className="scrollbar-slick flex gap-1 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "h-7 shrink-0 rounded-full border border-border px-2.5 text-xs font-medium transition-colors hover:bg-accent",
              filter === "all"
                ? "bg-foreground text-background"
                : "bg-background text-muted-foreground",
            )}
          >
            All
          </button>
          {RESOURCE_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                "h-7 shrink-0 rounded-full border border-border px-2.5 text-xs font-medium transition-colors hover:bg-accent",
                filter === option.value
                  ? "bg-foreground text-background"
                  : "bg-background text-muted-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {!resources || resources.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-center">
          <ExternalLink className="h-5 w-5 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">
            No resources yet. Add the first useful link for this problem.
          </p>
        </div>
      ) : visibleResources.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No resources in this category yet.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleResources.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              isSignedIn={isSignedIn}
              onError={setError}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddResourceForm({
  track,
  topicSlug,
  questionId,
  onCreated,
  onCancel,
  onError,
}: {
  track: TrackSlug;
  topicSlug: string;
  questionId: string;
  onCreated: () => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ResourceType>("article");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setSubmitting(true);
      onError(null);
      try {
        const res = await fetch("/api/resources", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            questionId,
            track,
            topicSlug,
            url,
            title,
            description,
            type,
            containsFullSolution: false,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Could not add resource.");
        setUrl("");
        setTitle("");
        setDescription("");
        onCreated();
      } catch (error) {
        onError(error instanceof Error ? error.message : "Could not add resource.");
      } finally {
        setSubmitting(false);
      }
    },
    [description, onCreated, onError, questionId, title, topicSlug, track, type, url],
  );

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-border bg-card/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">Upload resource</p>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
          maxLength={2000}
          placeholder="Paste YouTube, article, docs, or discussion link"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/50"
        />
        <button
          type="submit"
          disabled={submitting}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-xs font-semibold text-background transition-opacity disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          placeholder="Optional title override"
          className="h-8 rounded-md border border-border bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground focus:border-foreground/50"
        />
        <select
          value={type}
          onChange={(event) => setType(event.target.value as ResourceType)}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-foreground/50"
        >
          {RESOURCE_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={400}
        rows={2}
        placeholder="Optional note about why this helps"
        className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-xs outline-none placeholder:text-muted-foreground focus:border-foreground/50"
      />
    </form>
  );
}

function ResourceCard({
  resource,
  isSignedIn,
  onChanged,
  onError,
}: {
  resource: ResourceRow;
  isSignedIn: boolean;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const mutateResource = useCallback(
    async (action: "upvote" | "report", reason?: string) => {
      if (!isSignedIn) {
        onError("Sign in to use this action.");
        return;
      }
      onError(null);
      const res = await fetch(`/api/resources/${resource.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        onError(data?.error ?? "Action failed.");
        return;
      }
      onChanged();
    },
    [isSignedIn, onChanged, onError, resource.id],
  );

  return (
    <article className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex gap-3 p-3">
        {resource.thumbnailUrl ? (
          <div
            className="h-20 w-28 shrink-0 rounded-md border border-border bg-cover bg-center"
            style={{ backgroundImage: `url("${resource.thumbnailUrl}")` }}
            aria-hidden
          />
        ) : (
          <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
            <ExternalLink className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <ResourceTypeBadge type={resource.type} />
            {resource.verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                <ShieldCheck className="h-3 w-3" />
                Recommended
              </span>
            )}
            {resource.status === "hidden" && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
                Hidden
              </span>
            )}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
            {resource.title}
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {resource.provider === "youtube" ? "YouTube" : resource.siteName || resource.domain}
            {" · "}
            added by {resource.createdByName}
            {" · "}
            {timeAgo(resource.createdAt)}
          </p>
          {resource.description && (
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
              {resource.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={() => mutateResource("upvote")}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium transition-colors hover:bg-accent",
            resource.viewerUpvoted && "text-emerald-400",
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          {resource.upvoteCount}
        </button>
        <button
          type="button"
          onClick={() =>
            mutateResource(
              "report",
              resource.viewerReported ? undefined : "other",
            )
          }
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            resource.viewerReported && "text-amber-400",
          )}
        >
          <Flag className="h-3.5 w-3.5" />
          {resource.viewerReported ? "Undo report" : "Report"}
        </button>
        <a
          href={resource.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
        >
          Open
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <ResourceComments
        resource={resource}
        isSignedIn={isSignedIn}
        onChanged={onChanged}
        onError={onError}
      />
    </article>
  );
}

function ResourceTypeBadge({ type }: { type: ResourceType }) {
  const label = RESOURCE_TYPES.find((option) => option.value === type)?.label ?? type;
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      {label}
    </span>
  );
}

function ResourceComments({
  resource,
  isSignedIn,
  onChanged,
  onError,
}: {
  resource: ResourceRow;
  isSignedIn: boolean;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(resource.comments.length > 0);
  const [submitting, setSubmitting] = useState(false);

  const addComment = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!isSignedIn) {
        onError("Sign in to comment.");
        return;
      }
      setSubmitting(true);
      onError(null);
      try {
        const res = await fetch(`/api/resources/${resource.id}/comments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Could not add comment.");
        setText("");
        setOpen(true);
        onChanged();
      } catch (error) {
        onError(error instanceof Error ? error.message : "Could not add comment.");
      } finally {
        setSubmitting(false);
      }
    },
    [isSignedIn, onChanged, onError, resource.id, text],
  );

  const voteComment = useCallback(
    async (commentId: string) => {
      if (!isSignedIn) {
        onError("Sign in to upvote comments.");
        return;
      }
      const res = await fetch(`/api/resources/${resource.id}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "upvote" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        onError(data?.error ?? "Could not vote on comment.");
        return;
      }
      onChanged();
    },
    [isSignedIn, onChanged, onError, resource.id],
  );

  return (
    <div className="border-t border-border px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{resource.comments.length} comments</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {resource.comments.map((comment) => (
            <div
              key={comment.id}
              className={cn(
                "rounded-md border border-border bg-background px-2.5 py-2",
                comment.isAdmin && "border-emerald-500/30 bg-emerald-500/5",
              )}
            >
              <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{comment.createdByName}</span>
                {comment.isAdmin && (
                  <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-400">
                    Admin
                  </span>
                )}
                <span>{timeAgo(comment.createdAt)}</span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{comment.text}</p>
              <button
                type="button"
                onClick={() => voteComment(comment.id)}
                className={cn(
                  "mt-1.5 flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  comment.viewerUpvoted && "text-emerald-400",
                )}
              >
                <ThumbsUp className="h-3 w-3" />
                {comment.upvoteCount}
              </button>
            </div>
          ))}
          <form onSubmit={addComment} className="flex gap-2">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={!isSignedIn}
              maxLength={1000}
              placeholder={isSignedIn ? "Add a helpful note" : "Sign in to comment"}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground focus:border-foreground/50 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!isSignedIn || submitting || !text.trim()}
              className="h-8 rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable - ignore
    }
  }, [text]);

  if (label) {
    return (
      <button
        type="button"
        onClick={copy}
        className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-400" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        {copied ? "Copied" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy"
      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/* ====================================================================== */
/* stopwatch (top bar)                                                    */
/* ====================================================================== */

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Session stopwatch: icon collapses/expands, plain component state,
// no persistence.
function Stopwatch() {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          if (elapsed === 0) setRunning(true);
        }}
        title="Stopwatch"
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border px-2 transition-colors",
          running
            ? "border-border text-foreground"
            : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
        )}
      >
        <Timer className="h-4 w-4" />
        {elapsed > 0 && (
          <span className="font-mono text-xs tabular-nums">
            {formatClock(elapsed)}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex h-8 items-center gap-0.5 rounded-md border border-border px-1">
      <button
        type="button"
        onClick={() => setRunning((r) => !r)}
        title={running ? "Pause" : "Start"}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {running ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </button>
      <span className="min-w-[3.25rem] text-center font-mono text-sm tabular-nums text-foreground">
        {formatClock(elapsed)}
      </span>
      <button
        type="button"
        onClick={() => {
          setRunning(false);
          setElapsed(0);
        }}
        title="Reset"
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setExpanded(false)}
        title="Hide"
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ====================================================================== */
/* layout menu                                                            */
/* ====================================================================== */

// Miniature pane-map thumbnail for a layout. Draws the three panes at their
// relative widths; minimized panes shrink to a sliver.
function LayoutThumb({
  weights,
  active,
}: {
  weights: Record<PaneId, number>;
  active: boolean;
}) {
  const order: PaneId[] = ["problem", "editor", "mentor"];
  return (
    <div
      className={cn(
        "flex h-16 w-full items-stretch gap-1 rounded-md border p-1 transition-colors",
        active
          ? "border-emerald-500/50 bg-emerald-500/5"
          : "border-border bg-background group-hover:border-foreground/30",
      )}
    >
      {order.map((k) => (
        <div
          key={k}
          style={{ flexGrow: weights[k], flexBasis: 0 }}
          className={cn(
            "rounded-sm transition-colors",
            active
              ? k === "editor"
                ? "bg-emerald-500/40"
                : "bg-emerald-500/20"
              : k === "editor"
                ? "bg-foreground/30 group-hover:bg-foreground/40"
                : "bg-muted group-hover:bg-foreground/20",
          )}
          aria-hidden
        >
          {k === "editor" && (
            <span className="flex h-full flex-col gap-1 p-1">
              <span className="min-h-0 flex-1 rounded-[2px] bg-background/35" />
              <span className="h-3 rounded-[2px] bg-background/45" />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function LayoutMenu({
  current,
  minimized,
  maximized,
  onChoose,
  onFocusMode,
}: {
  current: LayoutId;
  minimized: Record<PaneId, boolean>;
  maximized: PaneId | null;
  onChoose: (id: LayoutId) => void;
  onFocusMode: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // The thumbnail reflects minimized panes too (a minimized pane reads as a
  // sliver), so the active preset's map matches what's on screen.
  const mapFor = (id: LayoutId): Record<PaneId, number> => {
    const base = LAYOUTS[id].weights;
    const out = { ...base };
    if (id === current) {
      for (const k of Object.keys(out) as PaneId[]) {
        if (minimized[k]) out[k] = RAIL_SIZE;
      }
    }
    return out;
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Layouts"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors",
          open
            ? "border-border text-foreground"
            : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
        )}
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden md:inline">Layout</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-80 origin-top-right rounded-xl border border-border bg-card p-4 shadow-xl shadow-black/40 animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Layouts</p>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Rows3 className="h-3.5 w-3.5" />
              drag to fine-tune
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(LAYOUTS) as LayoutId[]).map((id) => {
              const l = LAYOUTS[id];
              const active = current === id && !maximized;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onChoose(id);
                    setOpen(false);
                  }}
                  className="group flex flex-col gap-1.5 text-left"
                >
                  <LayoutThumb weights={mapFor(id)} active={active} />
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs font-medium",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {l.label}
                    {active && (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => {
                onFocusMode();
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                maximized === "editor"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                  : "border-border bg-background text-foreground hover:bg-accent",
              )}
            >
              <Maximize2 className="h-4 w-4" />
              {maximized === "editor" ? "Exit Focus Mode" : "Focus Mode"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ====================================================================== */
/* navigator drawer                                                       */
/* ====================================================================== */

function NavigatorDrawer({
  open,
  onClose,
  questions,
  currentId,
  completedIds,
  topicTitle,
  track,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  questions: QuestionMeta[];
  currentId: string | null;
  completedIds: Set<string>;
  topicTitle: string;
  track: TrackSlug;
  onSelect: (id: string) => void;
}) {
  const pct = questions.length
    ? (completedIds.size / questions.length) * 100
    : 0;
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-out",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-label="Question list"
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[340px] max-w-[88vw] flex-col border-r border-border bg-card shadow-2xl shadow-black/40 transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{topicTitle}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {completedIds.size} of {questions.length} solved
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-4 pt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <nav className="scrollbar-slick mt-2 flex-1 overflow-y-auto px-2.5 py-2">
          <ul className="flex flex-col gap-1">
            {questions.map((q, i) => {
              const isCurrent = q.id === currentId;
              const done = completedIds.has(q.id);
              const d = diffOf(q.difficulty);
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(q.id)}
                    aria-current={isCurrent ? "true" : undefined}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      isCurrent
                        ? "border-border bg-accent"
                        : "border-transparent hover:border-border hover:bg-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-semibold tabular-nums",
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : done
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-muted text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          isCurrent
                            ? "text-foreground"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        {q.title}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[11px] font-medium",
                          DIFF[d].text,
                        )}
                      >
                        {DIFF[d].label}
                      </span>
                    </span>
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : isCurrent ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-foreground/60" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <footer className="border-t border-border px-4 py-3">
          <Link
            href={`/${track}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={onClose}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to roadmap
          </Link>
        </footer>
      </aside>
    </>
  );
}

/* ====================================================================== */
/* solved card                                                            */
/* ====================================================================== */

function SolvedCard({
  progress,
  track,
  onNext,
}: {
  progress: NonNullable<CompletionResult>;
  track: TrackSlug;
  onNext: () => void;
}) {
  const finishedTopic = progress.topicCompleted;
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
          {finishedTopic ? (
            <Trophy className="h-7 w-7 text-amber-400" />
          ) : (
            <CheckCircle2 className="h-7 w-7 text-emerald-400" />
          )}
        </div>
        <h3 className="mt-4 text-lg font-semibold">
          {finishedTopic ? "Topic complete." : "Nice. Accepted."}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {finishedTopic
            ? "You worked through every question here."
            : "That one's done. Ready for the next?"}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {progress.completedCount}/{progress.totalCount}
            </span>
            solved
          </span>
          {progress.xpAwarded > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 font-medium text-foreground">
              +{progress.xpAwarded} XP
            </span>
          ) : null}
          {progress.streakUpdated ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 font-medium text-amber-400 ring-1 ring-inset ring-amber-500/20">
              <Flame className="h-3.5 w-3.5" />
              {progress.streak.count}
            </span>
          ) : null}
        </div>

        {finishedTopic ? (
          <Link
            href={`/${track}`}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to roadmap
          </Link>
        ) : progress.currentQuestionId ? (
          <button
            type="button"
            onClick={onNext}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Next question
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ====================================================================== */
/* settings popover                                                       */
/* ====================================================================== */

function SettingsMenu({
  shortcutsEnabled,
  onShortcutsChange,
  onOpenCheat,
}: {
  shortcutsEnabled: boolean;
  onShortcutsChange: (v: boolean) => void;
  onOpenCheat: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Shortcuts & settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
          open
            ? "border-border text-foreground"
            : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
        )}
      >
        <Keyboard className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Settings"
          className="absolute right-0 top-10 z-50 w-72 origin-top-right rounded-lg border border-border bg-card p-1 shadow-xl shadow-black/40 animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150"
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent">
            <span className="mt-0.5">
              <Keyboard className="h-4 w-4 text-muted-foreground" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">
                Keyboard shortcuts
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Switch questions and panes from the keyboard.
              </span>
            </span>
            <Switch checked={shortcutsEnabled} onChange={onShortcutsChange} />
          </label>

          {shortcutsEnabled && (
            <div className="mt-1 border-t border-border px-3 py-2.5">
              <ul className="space-y-1.5">
                {SHORTCUTS.map((s) => (
                  <li
                    key={s.keys}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-muted-foreground">{s.label}</span>
                    <Kbd>{s.keys}</Kbd>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenCheat();
                }}
                className="mt-2 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Open cheat-sheet
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      className={cn(
        "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-foreground/20 bg-foreground" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform duration-200",
          checked ? "translate-x-[1.125rem]" : "translate-x-[0.1875rem]",
        )}
      />
    </button>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] text-foreground">
      {children}
    </kbd>
  );
}

/* ====================================================================== */
/* shared shells + skeletons                                              */
/* ====================================================================== */

function PaneCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      {children}
    </div>
  );
}

function ConceptualNote({
  solvedThis,
  onComplete,
}: {
  solvedThis: boolean;
  onComplete: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xs rounded-xl border border-border bg-background px-5 py-4 text-center">
        <MessageSquare className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium text-foreground">
          No code for this one.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          It&apos;s a conceptual question - work through it with the tutor.
        </p>
        {solvedThis ? (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Completed
          </p>
        ) : (
          <button
            type="button"
            onClick={onComplete}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark as complete
          </button>
        )}
      </div>
    </div>
  );
}

function ProblemSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-6 w-2/3 rounded bg-muted" />
      <div className="h-5 w-24 rounded-full bg-muted/70" />
      <div className="space-y-2.5 pt-3">
        <div className="h-3.5 w-full rounded bg-muted/70" />
        <div className="h-3.5 w-11/12 rounded bg-muted/70" />
        <div className="h-3.5 w-4/5 rounded bg-muted/70" />
        <div className="h-3.5 w-full rounded bg-muted/70" />
        <div className="h-3.5 w-3/4 rounded bg-muted/70" />
      </div>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3 p-4">
      <div className="h-6 w-24 rounded bg-muted" />
      <div className="flex-1 space-y-2 rounded-md bg-background/60 p-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-muted/70"
            style={{ width: `${45 + ((i * 17) % 50)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
