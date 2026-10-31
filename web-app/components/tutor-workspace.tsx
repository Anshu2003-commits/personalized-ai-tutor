"use client";

import dynamic from "next/dynamic";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AArrowDown,
  AArrowUp,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Cloud,
  CloudOff,
  CloudUpload,
  Code2,
  Copy,
  Loader2,
  Minus,
  Play,
  Plus,
  RotateCcw,
  SquareTerminal,
  X,
  XCircle,
} from "lucide-react";
import {
  type ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { useRuntime } from "@/hooks/use-runtime";
import { useDraft, type SyncStatus } from "@/hooks/use-draft";
import { judge } from "@/lib/execution/judge";
import { toDisplay } from "@/lib/execution/value";
import { extractResult, parseInputsForDisplay } from "@/lib/execution/io";
import { prepareProgram, starterFor } from "@/lib/execution/program";
import {
  type EditorLanguage,
  type EditorLanguageId,
  DEFAULT_LANGUAGE,
  EDITOR_LANGUAGES,
  getEditorLanguage,
  languagesForTrack,
  resolveMode,
} from "@/lib/execution/editor-languages";
import { cn } from "@/lib/utils";
import type { FunctionSignature, TestCase, TrackSlug } from "@/lib/types";

// crossOriginIsolated is constant per document; read once (false on the server,
// and for the runtimes that need it until COOP/COEP is enabled). Kept a module
// const so the availability check stays pure for the React Compiler.
const CROSS_ORIGIN_ISOLATED =
  typeof globalThis !== "undefined" &&
  (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;

const CodeEditor = dynamic(() => import("./code-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      Loading editor…
    </div>
  ),
});

export type WorkspaceSubmission = {
  status: "accepted" | "wrong_answer" | "runtime_error";
  runtimeMs: number;
  passedCount: number;
  totalCount: number;
  code: string;
};

export type EditorCodeSnapshot = {
  questionId: string;
  language: EditorLanguageId;
  code: string;
  starterCode: string;
};

type TutorWorkspaceProps = {
  track: TrackSlug;
  questionId: string;
  topicSlug: string;
  /** Catalog function signature (DSA) - drives per-language boilerplate. */
  structure?: FunctionSignature;
  /** Catalog starter_code (DS + a few DSA implementation problems), Python. */
  starterCode?: string;
  /** Full catalog test_cases - may be empty (a few DS questions). */
  testCases: TestCase[];
  /** Apply `code` into the editor whenever `nonce` changes. */
  externalCode?: { code: string; nonce: number } | null;
  /** Fired once per mount on the first accepted submit. */
  onQuestionCompleted?: () => void;
  /** Latest editor buffer, used by the tutor when the student sends a chat turn. */
  onEditorSnapshotChange?: (snapshot: EditorCodeSnapshot) => void;
  /** Window controls (minimize/maximize) rendered into the editor toolbar. */
  paneControls?: ReactNode;
};

type ConsoleTab = "testcase" | "result";
type Phase = "idle" | "running" | "submitting";

// A case shown in the Testcase tab. Catalog cases are judged against their
// expected output as long as the input matches the original; edit the input
// (or add via "+") and the case turns custom - runnable, but not judged.
type VisibleCase = {
  key: string;
  kind: "catalog" | "custom";
  input: string;
  originalInput?: string;
  expected: string;
};

type ExecutedCase = {
  label: string;
  input: string;
  stdout: string; // the judged answer (canonical in function mode)
  userOutput?: string; // the learner's own console output (function mode)
  stderr: string;
  timeMs: number;
  judged: boolean;
  expected: string;
  passed: boolean | null; // null = not judged (custom case)
};

type Outcome =
  | { kind: "run"; cases: ExecutedCase[] }
  | {
      kind: "submit";
      status: WorkspaceSubmission["status"];
      passedCount: number;
      totalCount: number;
      runtimeMs: number;
      failure: ExecutedCase | null;
    };

const FONT_KEY = "onlearn:editor:fontSize";
const FONT_MIN = 12;
const FONT_MAX = 18;
const FONT_DEFAULT = 13;
const MAX_CUSTOM_CASES = 3;
const CONSOLE_RAIL_SIZE = 4;

// Editor font size, persisted to localStorage. Backed by an external store
// (same pattern as use-tutor-settings) so it reads synchronously, hydrates
// cleanly from the default, and stays in sync across mounted workspaces.
const FONT_CHANGE_EVENT = "onlearn:editor:fontSize:change";

function subscribeFontSize(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(FONT_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(FONT_CHANGE_EVENT, callback);
  };
}

function getFontSizeSnapshot(): number {
  try {
    const v = Number(localStorage.getItem(FONT_KEY));
    return Number.isFinite(v) && v >= FONT_MIN && v <= FONT_MAX
      ? v
      : FONT_DEFAULT;
  } catch {
    return FONT_DEFAULT;
  }
}

function useEditorFontSize() {
  const fontSize = useSyncExternalStore(
    subscribeFontSize,
    getFontSizeSnapshot,
    () => FONT_DEFAULT,
  );

  const adjustFontSize = useCallback((delta: number) => {
    const next = Math.min(
      FONT_MAX,
      Math.max(FONT_MIN, getFontSizeSnapshot() + delta),
    );
    try {
      localStorage.setItem(FONT_KEY, String(next));
    } catch {
      return; // storage unavailable - size can't change
    }
    window.dispatchEvent(new Event(FONT_CHANGE_EVENT));
  }, []);

  return { fontSize, adjustFontSize };
}

// Selected editor language, persisted to localStorage so it survives question
// navigation (the workspace is keyed/remounted per question) and stays in sync
// across mounted workspaces. Same external-store pattern as the font size.
const LANG_KEY = "onlearn:editor:language";
const LANG_CHANGE_EVENT = "onlearn:editor:language:change";

function subscribeLanguage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LANG_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LANG_CHANGE_EVENT, callback);
  };
}

function getLanguageSnapshot(): EditorLanguageId {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v && v in EDITOR_LANGUAGES ? (v as EditorLanguageId) : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function useSelectedLanguage(): [EditorLanguageId, (id: EditorLanguageId) => void] {
  const language = useSyncExternalStore(
    subscribeLanguage,
    getLanguageSnapshot,
    () => DEFAULT_LANGUAGE,
  );
  const setLanguage = useCallback((id: EditorLanguageId) => {
    try {
      localStorage.setItem(LANG_KEY, id);
    } catch {
      return; // storage unavailable - selection can't persist
    }
    window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
  }, []);
  return [language, setLanguage];
}

function isJudged(c: VisibleCase): boolean {
  return c.kind === "catalog" && c.input === c.originalInput;
}

function buildInitialCases(testCases: TestCase[]): VisibleCase[] {
  const samples = testCases.filter((tc) => tc.is_sample);
  const base = samples.length > 0 ? samples : testCases.slice(0, 3);
  if (base.length === 0) {
    // No catalog cases at all - give one scratch case so Run still works.
    return [{ key: "scratch", kind: "custom", input: "", expected: "" }];
  }
  // Normalize to display strings: most catalog values are strings, but some are
  // raw JSON (arrays/bools/ints) which would otherwise break the textarea and
  // crash on `.trim()`. toDisplay renders them canonically.
  return base.map((tc, i) => ({
    key: `catalog-${i}`,
    kind: "catalog" as const,
    input: toDisplay(tc.input),
    originalInput: toDisplay(tc.input),
    expected: toDisplay(tc.expected_output),
  }));
}

/**
 * The code workspace: a syntax-highlighted editor over a resizable console
 * (testcase + result), with Run and Submit. Run executes the visible cases
 * without recording progress; Submit judges the full catalog suite and, on
 * accept, fires completion. The editor buffer is persisted DB-first via
 * useDraft (in-memory only when signed out). Execution reuses the proven
 * Pyodide model (DSA reads stdin, DS appends the test expression) so behaviour
 * matches the rest of the app.
 */
/**
 * Outer shell: owns the selected language and re-keys the inner workspace by it.
 * Switching languages remounts WorkspaceInner, giving fresh draft/runtime
 * bookkeeping for the new (question, language) - the same isolation question
 * switches already get via the parent's `key={question_id}`. useDraft's
 * unmount effect flushes the outgoing language's buffer before it tears down.
 */
export default function TutorWorkspace(props: TutorWorkspaceProps) {
  const availableLanguages = useMemo(
    () => languagesForTrack(props.track),
    [props.track],
  );
  const [language, setLanguage] = useSelectedLanguage();
  // Guard against a language not offered for this track (e.g. cached state).
  const safeLanguage = availableLanguages.some((l) => l.id === language)
    ? language
    : DEFAULT_LANGUAGE;

  return (
    <WorkspaceInner
      key={safeLanguage}
      {...props}
      language={safeLanguage}
      availableLanguages={availableLanguages}
      onSelectLanguage={setLanguage}
    />
  );
}

type WorkspaceInnerProps = TutorWorkspaceProps & {
  language: EditorLanguageId;
  availableLanguages: EditorLanguage[];
  onSelectLanguage: (id: EditorLanguageId) => void;
};

function WorkspaceInner({
  track,
  questionId,
  topicSlug,
  structure,
  starterCode,
  testCases,
  externalCode,
  onQuestionCompleted,
  onEditorSnapshotChange,
  paneControls,
  language,
  availableLanguages,
  onSelectLanguage,
}: WorkspaceInnerProps) {
  const activeLang = getEditorLanguage(language);
  const mode = resolveMode(language, { track, structure, starterCode });

  // Starter code for the current language. Seeds the editor and draft baseline;
  // a persisted draft (if any) overrides it via the seed effect after GET.
  const initialCode = useMemo(
    () => starterFor(language, { track, structure, starterCode }),
    [language, track, structure, starterCode],
  );

  // The editor buffer starts from the starter code; a persisted draft (if any)
  // is applied via the seed effect once useDraft's GET resolves.
  const [code, setCode] = useState<string>(initialCode);
  const { fontSize, adjustFontSize } = useEditorFontSize();
  const [visibleCases, setVisibleCases] = useState<VisibleCase[]>(() =>
    buildInitialCases(testCases),
  );
  const [activeCaseIdx, setActiveCaseIdx] = useState(0);
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [caseProgress, setCaseProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>("testcase");
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const completedRef = useRef(false);
  const customSeq = useRef(0);
  const externalNonceRef = useRef<number | null>(externalCode?.nonce ?? null);
  const draftNonceRef = useRef<number | null>(null);
  const consoleRef = useRef<ImperativePanelHandle>(null);

  // The runtime is selected by language; the singleton manager boots one worker
  // per family per tab and reuses it across question/language switches.
  const {
    init: initRuntime,
    run: runCode,
    isReady,
    isLoading,
    initError,
  } = useRuntime(activeLang.runtimeKind);

  // DB-first persistence for the editor buffer (in-memory only when signed out),
  // keyed per language so switching languages keeps each language's work.
  const {
    status: syncStatus,
    seed: draftSeed,
    notifyChange: notifyDraftChange,
    flush: flushDraft,
    reset: resetDraft,
    keepLocal: keepLocalDraft,
    useServer: useServerDraft,
  } = useDraft({ track, topicSlug, questionId, language, initialCode });

  // Only boot runtimes that can actually execute now (Python + JavaScript).
  // C/C++/Go are edit-only until their assets/deps (and, for clang, cross-origin
  // isolation) land; Run/Submit is gated below so we never trigger a doomed init.
  // Inlined (rather than an isAvailable() call) so the React Compiler can track
  // `runnable` through the init effect's deps - pure property access + a const.
  const runnable =
    activeLang.runnable &&
    (!activeLang.capabilities.needsCrossOriginIsolation || CROSS_ORIGIN_ISOLATED);
  useEffect(() => {
    if (runnable) void initRuntime();
  }, [runnable, initRuntime]);

  // The parent keys this component by question id, but a stale-while-loading
  // window in useQuestion can keep the instance alive across a rapid
  // back-and-forth switch - reset the once-per-question completion latch
  // whenever the question prop actually changes.
  useEffect(() => {
    completedRef.current = false;
  }, [questionId]);

  // ---- code drafts ---------------------------------------------------------

  // Seed the editor from the persisted draft (initial load, reset, or "use
  // server version") whenever useDraft hands back a new nonce.
  useEffect(() => {
    if (!draftSeed) return;
    if (draftNonceRef.current === draftSeed.nonce) return;
    draftNonceRef.current = draftSeed.nonce;
    setCode(draftSeed.code);
  }, [draftSeed]);

  // Persist every edit (debounced inside the hook). Seeded values are a no-op
  // because the hook tracks the last-saved content.
  useEffect(() => {
    notifyDraftChange(code);
  }, [code, notifyDraftChange]);

  useEffect(() => {
    onEditorSnapshotChange?.({ questionId, language, code, starterCode: initialCode });
  }, [onEditorSnapshotChange, questionId, language, code, initialCode]);

  // External code (e.g. from the mentor) replaces the editor content whenever
  // the nonce moves; the change effect above then persists it like any edit.
  useEffect(() => {
    if (!externalCode) return;
    if (externalNonceRef.current === externalCode.nonce) return;
    externalNonceRef.current = externalCode.nonce;
    setCode(externalCode.code);
  }, [externalCode]);

  // ---- testcase management -------------------------------------------------

  const customCount = useMemo(
    () => visibleCases.filter((c) => c.kind === "custom").length,
    [visibleCases],
  );

  const addCustomCase = useCallback(() => {
    if (customCount >= MAX_CUSTOM_CASES) return;
    customSeq.current += 1;
    const src = visibleCases[Math.min(activeCaseIdx, visibleCases.length - 1)];
    const next: VisibleCase[] = [
      ...visibleCases,
      {
        key: `custom-${customSeq.current}`,
        kind: "custom",
        input: src?.input ?? "",
        expected: "",
      },
    ];
    setVisibleCases(next);
    setActiveCaseIdx(next.length - 1);
  }, [customCount, visibleCases, activeCaseIdx]);

  const removeCase = useCallback(
    (idx: number) => {
      if (visibleCases.length <= 1) return;
      const next = visibleCases.filter((_, i) => i !== idx);
      setVisibleCases(next);
      setActiveCaseIdx((cur) =>
        Math.min(idx < cur ? cur - 1 : cur, next.length - 1),
      );
    },
    [visibleCases],
  );

  const updateCaseInput = useCallback((idx: number, value: string) => {
    setVisibleCases((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, input: value } : c)),
    );
  }, []);

  // ---- execution -----------------------------------------------------------

  // DSA: user code reads stdin via input() and prints. DS: user code defines a
  // function; the driver does I/O + canonical serialization. prepareProgram
  // composes the exact source per mode; in function mode the judged answer is
  // the RESULT_MARKER line, with any learner prints kept as userOutput.
  const executeCase = useCallback(
    async (codeSnapshot: string, input: string) => {
      const t0 = performance.now();
      const prep = prepareProgram(
        language,
        { track, structure, starterCode },
        codeSnapshot,
        input,
      );
      const r = await runCode(prep.program, prep.stdin, prep.meta);
      const { answer, userOutput } = prep.functionMode
        ? extractResult(r.stdout ?? "")
        : { answer: r.stdout ?? "", userOutput: "" };
      return {
        answer,
        userOutput,
        stderr: r.stderr ?? "",
        timeMs: Math.round(performance.now() - t0),
      };
    },
    [runCode, language, track, structure, starterCode],
  );

  const handleRun = useCallback(async () => {
    const codeSnapshot = code;
    const snapshot = visibleCases;
    setPhase("running");
    setOutcome(null);
    setErr(null);
    setConsoleTab("result");
    try {
      const cases: ExecutedCase[] = [];
      for (let i = 0; i < snapshot.length; i++) {
        setCaseProgress({ done: i, total: snapshot.length });
        const c = snapshot[i];
        const judged = isJudged(c);
        const r = await executeCase(codeSnapshot, c.input);
        cases.push({
          label: `Case ${i + 1}`,
          input: c.input,
          stdout: r.answer,
          userOutput: r.userOutput,
          stderr: r.stderr,
          timeMs: r.timeMs,
          judged,
          expected: c.expected,
          passed: judged ? !r.stderr && judge(r.answer, c.expected) : null,
        });
      }
      const firstFail = cases.findIndex(
        (c) => c.stderr !== "" || c.passed === false,
      );
      setActiveResultIdx(firstFail >= 0 ? firstFail : 0);
      setOutcome({ kind: "run", cases });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCaseProgress(null);
      setPhase("idle");
    }
  }, [code, visibleCases, executeCase]);

  const handleSubmit = useCallback(async () => {
    if (testCases.length === 0) return;
    const codeSnapshot = code;
    setPhase("submitting");
    setOutcome(null);
    setErr(null);
    setConsoleTab("result");
    try {
      const executed: ExecutedCase[] = [];
      let runtimeMs = 0;
      let passedCount = 0;
      let anyStderr = false;
      for (let i = 0; i < testCases.length; i++) {
        setCaseProgress({ done: i, total: testCases.length });
        const tc = testCases[i];
        const input = toDisplay(tc.input);
        const r = await executeCase(codeSnapshot, input);
        runtimeMs += r.timeMs;
        const passed = !r.stderr && judge(r.answer, tc.expected_output);
        if (r.stderr) anyStderr = true;
        if (passed) passedCount++;
        executed.push({
          label: `Case ${i + 1}`,
          input,
          stdout: r.answer,
          userOutput: r.userOutput,
          stderr: r.stderr,
          timeMs: r.timeMs,
          judged: true,
          expected: toDisplay(tc.expected_output),
          passed,
        });
      }

      const status: WorkspaceSubmission["status"] = anyStderr
        ? "runtime_error"
        : passedCount === testCases.length
          ? "accepted"
          : "wrong_answer";
      setOutcome({
        kind: "submit",
        status,
        passedCount,
        totalCount: testCases.length,
        runtimeMs,
        failure: executed.find((c) => !c.passed) ?? null,
      });

      // Persist the submitted code snapshot immediately (best-effort).
      flushDraft();
      if (status === "accepted" && !completedRef.current) {
        completedRef.current = true;
        onQuestionCompleted?.();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCaseProgress(null);
      setPhase("idle");
    }
  }, [testCases, code, executeCase, flushDraft, onQuestionCompleted]);

  // ---- toolbar actions -----------------------------------------------------

  // resetDraft re-seeds the editor to the starter code and clears the stored
  // draft; we just clear the transient run/submit output here. Gated behind an
  // explicit confirmation in ResetButton.
  const handleReset = useCallback(() => {
    resetDraft();
    setOutcome(null);
    setErr(null);
  }, [resetDraft]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable - ignore
    }
  }, [code]);

  const collapseConsole = useCallback(() => {
    consoleRef.current?.collapse();
    setConsoleCollapsed(true);
  }, []);

  const expandConsole = useCallback(() => {
    consoleRef.current?.expand();
    setConsoleCollapsed(false);
  }, []);

  // ---- derived view state --------------------------------------------------

  // `runnable` is computed at the runtime-init effect above (isAvailable).
  // Edit-only languages (C/C++/Go until their runtimes ship): write, save, and
  // switch freely; Run/Submit is gated with this note rather than a failed init.
  const gateNote = runnable
    ? null
    : `Running ${activeLang.label} in the browser is coming soon - you can write, save, and switch languages now.`;
  const busy = phase !== "idle";
  const runDisabled = !runnable || !isReady || busy;
  const submitDisabled = runDisabled || testCases.length === 0;
  const busyLabel =
    runnable && !isReady
      ? isLoading
        ? "Loading runtime…"
        : "Starting runtime…"
      : null;

  const testLabel = track === "ds" ? "Test expression" : "Input";

  const outcomeTone = useMemo<"ok" | "error" | null>(() => {
    if (!outcome) return null;
    if (outcome.kind === "submit")
      return outcome.status === "accepted" ? "ok" : "error";
    if (outcome.cases.some((c) => c.stderr || c.passed === false))
      return "error";
    return outcome.cases.some((c) => c.judged) ? "ok" : null;
  }, [outcome]);

  const activeCase = visibleCases[Math.min(activeCaseIdx, visibleCases.length - 1)];

  return (
    <PanelGroup direction="vertical" className="h-full">
      {/* ---------------- Editor ---------------- */}
      <Panel defaultSize={62} minSize={30} className="flex min-h-0 flex-col">
        {/* editor toolbar - language + utilities */}
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
            <Code2 className="h-4 w-4 shrink-0 text-emerald-500" />
            Code
            <LanguageMenu
              current={activeLang}
              languages={availableLanguages}
              onSelect={onSelectLanguage}
            />
            <IoGuideButton
              track={track}
              language={activeLang}
              mode={mode}
              hasStructure={Boolean(structure)}
            />
            <SyncStatusBadge
              status={syncStatus}
              onKeepLocal={keepLocalDraft}
              onUseServer={useServerDraft}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ResetButton onReset={handleReset} />
            <button
              type="button"
              onClick={handleCopy}
              title="Copy code"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => adjustFontSize(-1)}
              title="Decrease font size"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <AArrowDown className="h-3.5 w-3.5" />
            </button>
            <span className="w-5 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
              {fontSize}
            </span>
            <button
              type="button"
              onClick={() => adjustFontSize(1)}
              title="Increase font size"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <AArrowUp className="h-3.5 w-3.5" />
            </button>
            {paneControls}
          </div>
        </div>
        <div className="scrollbar-slick min-h-0 flex-1 overflow-hidden">
          <CodeEditor
            value={code}
            onChange={setCode}
            fontSize={fontSize}
            language={language}
          />
        </div>
      </Panel>

      <PanelResizeHandle className="relative h-px shrink-0 bg-border outline-none transition-colors after:absolute after:inset-x-0 after:top-1/2 after:h-3 after:-translate-y-1/2 after:content-[''] data-[resize-handle-state=hover]:bg-foreground/25 data-[resize-handle-state=drag]:bg-foreground/40" />

      {/* ---------------- Console ---------------- */}
      <Panel
        ref={consoleRef}
        defaultSize={38}
        minSize={16}
        collapsible
        collapsedSize={CONSOLE_RAIL_SIZE}
        onCollapse={() => setConsoleCollapsed(true)}
        onExpand={() => setConsoleCollapsed(false)}
        className="flex min-h-0 flex-col"
      >
        {consoleCollapsed ? (
          <ConsoleRail
            activeTab={consoleTab}
            outcomeTone={outcomeTone}
            onExpand={expandConsole}
          />
        ) : (
          <>
            {/* console header: tabs + run/submit */}
            <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
              <div className="flex items-center gap-0.5">
                <ConsoleTabButton
                  active={consoleTab === "testcase"}
                  onClick={() => setConsoleTab("testcase")}
                >
                  Testcase
                </ConsoleTabButton>
                <ConsoleTabButton
                  active={consoleTab === "result"}
                  onClick={() => setConsoleTab("result")}
                >
                  <span className="flex items-center gap-1.5">
                    Result
                    {outcomeTone && (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          outcomeTone === "ok"
                            ? "bg-emerald-400"
                            : "bg-rose-400",
                        )}
                      />
                    )}
                  </span>
                </ConsoleTabButton>
              </div>

              <div className="flex items-center gap-1.5 pr-1">
                <button
                  type="button"
                  onClick={collapseConsole}
                  title="Minimize console"
                  aria-label="Minimize console"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleRun()}
                  disabled={runDisabled}
                  title={gateNote ?? busyLabel ?? "Run the visible test cases"}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {phase === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Run
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitDisabled}
                  title={
                    gateNote ??
                    (testCases.length === 0
                      ? "No test cases for this question - use Run"
                      : (busyLabel ?? "Submit against all test cases"))
                  }
                  className="flex h-7 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {phase === "submitting" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CloudUpload className="h-3.5 w-3.5" />
                  )}
                  Submit
                </button>
              </div>
            </div>

            {/* console body */}
            <div className="scrollbar-slick min-h-0 flex-1 overflow-y-auto p-3">
              {consoleTab === "testcase" ? (
                <div className="space-y-3">
                  {mode === "function" && (
                    <p className="rounded-md bg-emerald-500/10 px-3 py-1.5 text-[11px] leading-relaxed text-emerald-300/90">
                      Write only the function - the input is parsed for you and
                      your return value is checked automatically.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {visibleCases.map((c, i) => (
                      <CaseChip
                        key={c.key}
                        label={`Case ${i + 1}`}
                        active={i === activeCaseIdx}
                        onSelect={() => setActiveCaseIdx(i)}
                        onRemove={
                          c.kind === "custom" && visibleCases.length > 1
                            ? () => removeCase(i)
                            : undefined
                        }
                      />
                    ))}
                    <button
                      type="button"
                      onClick={addCustomCase}
                      disabled={customCount >= MAX_CUSTOM_CASES}
                      title={
                        customCount >= MAX_CUSTOM_CASES
                          ? "Up to 3 custom cases"
                          : "Add a custom case"
                      }
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {activeCase && (
                    <>
                      <div>
                        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                          {testLabel}
                        </p>
                        <textarea
                          value={activeCase.input}
                          onChange={(e) =>
                            updateCaseInput(activeCaseIdx, e.target.value)
                          }
                          aria-label={testLabel}
                          spellCheck={false}
                          rows={Math.min(
                            6,
                            Math.max(2, activeCase.input.split("\n").length),
                          )}
                          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[12.5px] leading-relaxed text-foreground outline-none transition-colors focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      {mode === "function" && (
                        <ParsedArgs structure={structure} input={activeCase.input} />
                      )}
                      {isJudged(activeCase) ? (
                        <Field
                          label="Expected output"
                          value={activeCase.expected}
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {activeCase.kind === "custom"
                            ? "Custom case - output is shown on Run, but it won't be judged."
                            : "Edited - this case won't be judged. Restore the original input to judge it again."}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <ResultBody
                  err={err ?? initError}
                  busy={busy}
                  phase={phase}
                  caseProgress={caseProgress}
                  busyLabel={busyLabel}
                  gateNote={gateNote}
                  outcome={outcome}
                  activeResultIdx={activeResultIdx}
                  onSelectResult={setActiveResultIdx}
                  testLabel={testLabel}
                  structure={structure}
                  functionMode={mode === "function"}
                />
              )}
            </div>
          </>
        )}
      </Panel>
    </PanelGroup>
  );
}

function ConsoleRail({
  activeTab,
  outcomeTone,
  onExpand,
}: {
  activeTab: ConsoleTab;
  outcomeTone: "ok" | "error" | null;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title="Restore console"
      aria-label="Restore console"
      className="group flex h-full w-full items-center justify-between gap-3 border-t border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <span className="flex items-center gap-2">
        <SquareTerminal className="h-3.5 w-3.5" />
        <span>{activeTab === "testcase" ? "Testcase" : "Result"}</span>
        {outcomeTone && (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              outcomeTone === "ok" ? "bg-emerald-400" : "bg-rose-400",
            )}
          />
        )}
      </span>
      <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" />
    </button>
  );
}

/* ====================================================================== */
/* toolbar: language menu                                                 */
/* ====================================================================== */

function LanguageMenu({
  current,
  languages,
  onSelect,
}: {
  current: EditorLanguage;
  languages: EditorLanguage[];
  onSelect: (id: EditorLanguageId) => void;
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

  // A single offered language (DS = Python only) - show it as a static label.
  if (languages.length <= 1) {
    return (
      <span className="flex h-6 items-center rounded-md px-1.5 font-mono text-[11px] text-muted-foreground">
        {current.label}
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Language"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-6 items-center gap-1 rounded-md px-1.5 font-mono text-[11px] transition-colors",
          open
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {current.label}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-7 z-50 w-44 origin-top-left rounded-lg border border-border bg-card p-1 shadow-xl shadow-black/40 animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {languages.map((l) => {
            const selected = l.id === current.id;
            return (
              <button
                key={l.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onSelect(l.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-accent",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="flex items-center gap-1.5">
                  {l.label}
                  {!l.runnable && (
                    <span
                      title="You can write and save now; running it is coming soon."
                      className="rounded bg-muted px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/80"
                    >
                      soon
                    </span>
                  )}
                </span>
                {selected && <Check className="h-3.5 w-3.5 text-emerald-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ====================================================================== */
/* toolbar: input/output guide                                            */
/* ====================================================================== */

type IoGuide = {
  title: string;
  input: string;
  output: string;
  careful: string[];
  handled: string[];
};

function dsaGuide(language: EditorLanguage, mode: "function" | "stdio"): IoGuide {
  if (mode === "function") {
    const languageNotes: Partial<Record<EditorLanguageId, Pick<IoGuide, "input" | "output" | "careful">>> = {
      python: {
        input:
          "We read the test input for you and pass it into your function as normal Python values. You don't read any input yourself.",
        output:
          "Just return the answer from your function. You don't need to print it.",
        careful: [
          "Keep the function name and its parameters exactly as given.",
          "You can use print() to check your work - it won't change the answer we grade.",
          "Return real Python values (lists, numbers, True/False, strings), not text you printed.",
        ],
      },
      javascript: {
        input:
          "We read the test input for you and pass it into your function as arguments. You don't read any input yourself.",
        output:
          "Just return the answer from your function. What you log to the console is not the answer.",
        careful: [
          "Keep the function name and the order of its parameters exactly as given.",
          "Return real values (arrays, numbers, true/false, strings) directly.",
          "Use console.log to check your work, not for the answer.",
        ],
      },
      cpp: {
        input:
          "We read the test input for you and call your C++ function with the right values. You don't read any input yourself.",
        output:
          "Just return the answer from your function. We format it for grading automatically.",
        careful: [
          "Keep the function name and its parameter types exactly as given.",
          "Return the exact type asked for, like int, bool, string, vector<int>, or vector<vector<int>>.",
          "Don't read from cin or print the answer in this mode.",
        ],
      },
    };
    const note = languageNotes[language.id] ?? languageNotes.python!;
    return {
      title: `${language.label} - just write the function`,
      input: note.input,
      output: note.output,
      careful: note.careful,
      handled: [
        "Reading the test input and turning it into the values your function needs.",
        "Running your function on every test case.",
        "Comparing the actual values, so different spacing or brackets won't fail a correct answer.",
        "Saving your code for each question and language automatically.",
        "Updating your progress, streak, and XP when a Submit passes.",
      ],
    };
  }

  const stdinNotes: Partial<Record<EditorLanguageId, Pick<IoGuide, "input" | "output" | "careful">>> = {
    python: {
      input:
        "Read the test input yourself with input() or sys.stdin. The starter code often does this for you.",
      output:
        "Print your final answer with print(). We compare what you print with the expected answer.",
      careful: [
        "Read the lines in the same order they appear in the test case.",
        "On Submit, print only the answer - no extra debug text.",
        "For lists or grids, print them in the same shape as the expected answer.",
      ],
    },
    javascript: {
      input:
        "The starter code reads the input text for you before your solve logic runs.",
      output:
        "Print your final answer with console.log. We compare it with the expected answer.",
      careful: [
        "Leave the input-reading part of the starter code as is, unless the problem needs a different format.",
        "On Submit, print only the answer.",
        "Input arrives as text - convert it to numbers where you need them.",
      ],
    },
    cpp: {
      input:
        "Read the test input yourself with cin, or use the reader code provided.",
      output:
        "Print your final answer with cout. We compare it with the expected answer.",
      careful: [
        "Read the values in the same order they appear in the test case.",
        "On Submit, print only the answer.",
        "Use vectors and loops for list and grid inputs.",
      ],
    },
    c: {
      input:
        "Read the test input yourself with scanf, or use the reader code provided.",
      output:
        "Print your final answer with printf. We compare it with the expected answer.",
      careful: [
        "C has no built-in list type - manage arrays, sizes, and memory yourself.",
        "Read the values in the same order they appear in the test case.",
        "On Submit, print only the answer.",
      ],
    },
    go: {
      input:
        "Read the test input yourself with fmt.Fscan or bufio, or use the scanner code provided.",
      output:
        "Print your final answer with fmt.Print or fmt.Println. We compare it with the expected answer.",
      careful: [
        "Read the values in the same order they appear in the test case.",
        "Use slices for list and grid inputs.",
        "On Submit, print only the answer.",
      ],
    },
  };
  const note = stdinNotes[language.id] ?? stdinNotes.python!;

  return {
    title: `${language.label} - read input, print output`,
    input: note.input,
    output: note.output,
    careful: note.careful,
    handled: [
      "Running each visible test case right in your browser.",
      "Running all the hidden test cases when you Submit.",
      "Tidying up small format differences (numbers, lists, grids, true/false) before comparing.",
      "Saving your code for each question and language automatically.",
      "Updating your progress, streak, and XP when a Submit passes.",
    ],
  };
}

function dsGuide(): IoGuide {
  return {
    title: "Data Science (Python)",
    input:
      "Each test case is a small Python expression. We run your code first, then run that expression using the variables and functions you created.",
    output:
      "We take the result of that expression and compare it with the expected answer. Usually you define variables or functions instead of printing anything.",
    careful: [
      "Don't delete the imports or setup code unless the problem asks you to.",
      "Keep the variable and function names that the test expects.",
      "Use print() just to explore - the graded answer comes from the test expression.",
      "Python runs in your browser, so popular packages like numpy and pandas work, but not every package is available.",
    ],
    handled: [
      "Running Python right in your browser (no setup needed).",
      "Running the test expression after your code and reading its result.",
      "Comparing that result with the expected answer.",
      "Saving your code for the question automatically.",
      "Updating your progress, streak, and XP when a Submit passes.",
    ],
  };
}

function ioGuideFor(args: {
  track: TrackSlug;
  language: EditorLanguage;
  mode: "function" | "stdio" | "ds";
  hasStructure: boolean;
}): IoGuide {
  if (args.track === "ds" || args.mode === "ds") return dsGuide();
  return dsaGuide(args.language, args.mode === "function" && args.hasStructure ? "function" : "stdio");
}

function IoGuideButton({
  track,
  language,
  mode,
  hasStructure,
}: {
  track: TrackSlug;
  language: EditorLanguage;
  mode: "function" | "stdio" | "ds";
  hasStructure: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const guide = ioGuideFor({ track, language, mode, hasStructure });

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
        title="Input and output guide"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
          open
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Input and output guide"
          className="absolute left-0 top-7 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-3 text-xs shadow-xl shadow-black/40 animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{guide.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {track === "ds" ? "Data Science" : "DSA"} · {language.label}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Close guide"
              aria-label="Close guide"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <GuideSection label="Input" body={guide.input} />
          <GuideSection label="Output" body={guide.output} />
          <GuideList label="Be careful about" items={guide.careful} />
          <GuideList label="Onlearn handles" items={guide.handled} />
        </div>
      )}
    </div>
  );
}

function GuideSection({ label, body }: { label: string; body: string }) {
  return (
    <div className="border-t border-border py-2 first:border-t-0 first:pt-0">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="leading-relaxed text-foreground/90">{body}</p>
    </div>
  );
}

function GuideList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="border-t border-border py-2 last:pb-0">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-1.5 text-foreground/90">
        {items.map((item) => (
          <li key={item} className="flex gap-2 leading-relaxed">
            <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ====================================================================== */
/* toolbar: sync status + reset                                           */
/* ====================================================================== */

const SYNC_META: Record<
  SyncStatus,
  {
    icon: typeof Cloud;
    label: string;
    title: string;
    className: string;
    spin?: boolean;
  }
> = {
  loading: {
    icon: Loader2,
    label: "Loading",
    title: "Loading your saved code…",
    className: "text-muted-foreground",
    spin: true,
  },
  synced: {
    icon: Cloud,
    label: "Synced",
    title: "All changes saved",
    className: "text-emerald-500",
  },
  unsaved: {
    icon: Cloud,
    label: "Unsaved",
    title: "You have unsaved changes",
    className: "text-amber-500",
  },
  saving: {
    icon: Loader2,
    label: "Saving…",
    title: "Saving your changes…",
    className: "text-muted-foreground",
    spin: true,
  },
  error: {
    icon: AlertTriangle,
    label: "Save failed",
    title: "Couldn't save - your next edit will retry",
    className: "text-destructive",
  },
  conflict: {
    icon: AlertTriangle,
    label: "Conflict",
    title: "This code changed in another session - click to resolve",
    className: "text-amber-500",
  },
  offline: {
    icon: CloudOff,
    label: "Not synced",
    title: "Sign in to sync your code across devices",
    className: "text-muted-foreground",
  },
};

// Live sync indicator. Calm (muted/emerald) at rest; coloured when there are
// unsaved edits, a failed save, or a cross-session conflict. The conflict state
// is interactive - it opens a keep-local vs load-server resolver.
function SyncStatusBadge({
  status,
  onKeepLocal,
  onUseServer,
}: {
  status: SyncStatus;
  onKeepLocal: () => void;
  onUseServer: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The resolver is only shown for a live conflict; it auto-hides (without a
  // state update) the moment the conflict clears.
  const showResolver = open && status === "conflict";

  useEffect(() => {
    if (!showResolver) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [showResolver]);

  const meta = SYNC_META[status];
  const Icon = meta.icon;

  const content = (
    <span className={cn("flex items-center gap-1", meta.className)}>
      <Icon className={cn("h-3.5 w-3.5", meta.spin && "animate-spin")} />
      <span className="hidden md:inline">{meta.label}</span>
    </span>
  );

  if (status !== "conflict") {
    return (
      <span
        title={meta.title}
        aria-label={meta.title}
        className="flex h-6 items-center rounded-md px-1 text-[11px] font-medium"
      >
        {content}
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={meta.title}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-6 items-center gap-0.5 rounded-md px-1 text-[11px] font-medium transition-colors hover:bg-accent"
      >
        {content}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Resolve sync conflict"
          className="absolute left-0 top-7 z-50 w-64 origin-top-left rounded-lg border border-border bg-card p-3 shadow-xl shadow-black/40 animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <p className="mb-1 text-xs font-semibold text-foreground">
            Code changed elsewhere
          </p>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            A newer version of this code was saved in another tab or device.
          </p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                onKeepLocal();
                setOpen(false);
              }}
              className="flex h-7 items-center justify-center rounded-md bg-foreground px-3 text-[11px] font-semibold text-background transition-colors hover:bg-foreground/90"
            >
              Keep my code
            </button>
            <button
              type="button"
              onClick={() => {
                onUseServer();
                setOpen(false);
              }}
              className="flex h-7 items-center justify-center rounded-md border border-border px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              Load saved version
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Reset to starter code, gated behind an explicit two-step confirmation so a
// stray click can't wipe the user's work.
function ResetButton({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Reset to starter code"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
          open
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Confirm reset"
          className="absolute right-0 top-7 z-50 w-64 origin-top-right rounded-lg border border-border bg-card p-3 shadow-xl shadow-black/40 animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <p className="mb-1 text-xs font-semibold text-foreground">
            Reset to starter code?
          </p>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            This discards your current code for this question and can&apos;t be
            undone.
          </p>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-7 items-center rounded-md border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
              className="flex h-7 items-center gap-1 rounded-md bg-destructive px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-destructive/90"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ====================================================================== */
/* console: tabs, chips, fields                                           */
/* ====================================================================== */

function ConsoleTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-9 items-center px-3 text-xs font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {active && (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" />
      )}
    </button>
  );
}

// A testcase chip. Custom cases carry a small remove button, which can't nest
// inside the select button, so the chip is a flex group of two buttons.
function CaseChip({
  label,
  active,
  dot,
  onSelect,
  onRemove,
}: {
  label: string;
  active: boolean;
  dot?: "ok" | "error" | "neutral";
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center overflow-hidden rounded-md text-xs font-medium transition-colors",
        active
          ? "bg-accent text-foreground"
          : "bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-1.5 px-2.5 py-1"
      >
        {dot && (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              dot === "ok"
                ? "bg-emerald-400"
                : dot === "error"
                  ? "bg-rose-400"
                  : "bg-muted-foreground/50",
            )}
          />
        )}
        {label}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove case"
          aria-label={`Remove ${label}`}
          className="-ml-1 flex h-full items-center pl-0.5 pr-1.5 text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <pre className="scrollbar-slick overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-background px-3 py-2 font-mono text-[12.5px] leading-relaxed text-foreground">
        {value || <span className="text-muted-foreground">(empty)</span>}
      </pre>
    </div>
  );
}

// In function mode, show the raw stdin parsed into the function's named args, so
// the learner reasons about `nums = [2, 7, 11, 15], target = 9`, not a stream.
function ParsedArgs({
  structure,
  input,
}: {
  structure?: FunctionSignature;
  input: string;
}) {
  const args = parseInputsForDisplay(structure, input);
  if (!args || args.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        As arguments
      </p>
      <div className="space-y-0.5 font-mono text-[12px] leading-relaxed">
        {args.map((a) => (
          <div key={a.name}>
            <span className="text-emerald-300/90">{a.name}</span>
            <span className="text-muted-foreground"> = </span>
            <span className="text-foreground">{a.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorBlock({ value }: { value: string }) {
  return (
    <pre className="whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/10 p-3 font-mono text-xs text-destructive/90">
      {value}
    </pre>
  );
}

function StatusLine({
  tone,
  title,
  time,
}: {
  tone: "ok" | "error" | "neutral";
  title: string;
  time: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={cn(
          "flex items-center gap-1.5 text-sm font-semibold",
          tone === "ok"
            ? "text-emerald-400"
            : tone === "error"
              ? "text-rose-400"
              : "text-muted-foreground",
        )}
      >
        {tone === "ok" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : tone === "error" ? (
          <XCircle className="h-4 w-4" />
        ) : (
          <SquareTerminal className="h-4 w-4" />
        )}
        {title}
      </span>
      <span className="font-mono text-xs text-muted-foreground">{time}ms</span>
    </div>
  );
}

/* ====================================================================== */
/* result tab                                                             */
/* ====================================================================== */

function ResultBody({
  err,
  busy,
  phase,
  caseProgress,
  busyLabel,
  gateNote,
  outcome,
  activeResultIdx,
  onSelectResult,
  testLabel,
  structure,
  functionMode,
}: {
  err: string | null;
  busy: boolean;
  phase: Phase;
  caseProgress: { done: number; total: number } | null;
  busyLabel: string | null;
  gateNote: string | null;
  outcome: Outcome | null;
  activeResultIdx: number;
  onSelectResult: (i: number) => void;
  testLabel: string;
  structure?: FunctionSignature;
  functionMode: boolean;
}) {
  if (err) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-destructive">
          <XCircle className="h-4 w-4" />
          Runtime error
        </p>
        <pre className="whitespace-pre-wrap font-mono text-xs text-destructive/90">
          {err}
        </pre>
      </div>
    );
  }

  if (busy) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {phase === "submitting" ? "Judging" : "Running"}
        {caseProgress
          ? ` case ${Math.min(caseProgress.done + 1, caseProgress.total)} / ${caseProgress.total}…`
          : "…"}
      </p>
    );
  }

  if (busyLabel) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {busyLabel}
      </p>
    );
  }

  if (!outcome) {
    return (
      <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 px-4 text-center">
        <SquareTerminal className="h-5 w-5 text-muted-foreground/60" />
        <p className="text-xs text-muted-foreground">
          {gateNote ?? "Run your code to see the result here."}
        </p>
      </div>
    );
  }

  if (outcome.kind === "submit") {
    return (
      <SubmitResultPanel
        outcome={outcome}
        testLabel={testLabel}
        structure={structure}
        functionMode={functionMode}
      />
    );
  }

  const active =
    outcome.cases[Math.min(activeResultIdx, outcome.cases.length - 1)];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {outcome.cases.map((c, i) => (
          <CaseChip
            key={c.label}
            label={c.label}
            active={i === activeResultIdx}
            dot={
              c.stderr || c.passed === false
                ? "error"
                : c.passed === true
                  ? "ok"
                  : "neutral"
            }
            onSelect={() => onSelectResult(i)}
          />
        ))}
      </div>
      {active && (
        <RunCaseDetail
          c={active}
          testLabel={testLabel}
          structure={structure}
          functionMode={functionMode}
        />
      )}
    </div>
  );
}

function RunCaseDetail({
  c,
  testLabel,
  structure,
  functionMode,
}: {
  c: ExecutedCase;
  testLabel: string;
  structure?: FunctionSignature;
  functionMode: boolean;
}) {
  const tone = c.stderr
    ? "error"
    : c.passed === true
      ? "ok"
      : c.passed === false
        ? "error"
        : "neutral";
  const title = c.stderr
    ? "Runtime error"
    : c.passed === true
      ? "Passed"
      : c.passed === false
        ? "Wrong answer"
        : "Ran";
  return (
    <div className="space-y-3">
      <StatusLine tone={tone} title={title} time={c.timeMs} />
      {functionMode ? (
        <ParsedArgs structure={structure} input={c.input} />
      ) : (
        <Field label={testLabel} value={c.input} />
      )}
      {c.stderr && <ErrorBlock value={c.stderr} />}
      {c.userOutput ? <Field label="Console" value={c.userOutput} /> : null}
      {c.judged && !c.stderr ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Output" value={c.stdout} />
          <Field label="Expected" value={c.expected} />
        </div>
      ) : (
        <Field label="Output" value={c.stdout} />
      )}
    </div>
  );
}

function SubmitResultPanel({
  outcome,
  testLabel,
  structure,
  functionMode,
}: {
  outcome: Extract<Outcome, { kind: "submit" }>;
  testLabel: string;
  structure?: FunctionSignature;
  functionMode: boolean;
}) {
  const accepted = outcome.status === "accepted";
  const verdict = accepted
    ? "Accepted"
    : outcome.status === "wrong_answer"
      ? "Wrong Answer"
      : "Runtime Error";
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span
          className={cn(
            "flex items-center gap-2 text-lg font-semibold tracking-tight",
            accepted ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {accepted ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          {verdict}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {outcome.runtimeMs}ms
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        passed{" "}
        <span className="font-mono font-medium text-foreground">
          {outcome.passedCount} / {outcome.totalCount}
        </span>{" "}
        testcases
      </p>
      {accepted ? (
        <p className="text-xs text-muted-foreground">
          Nice - that one&apos;s done.
        </p>
      ) : outcome.failure ? (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            First failing case
          </p>
          {functionMode ? (
            <ParsedArgs structure={structure} input={outcome.failure.input} />
          ) : (
            <Field label={testLabel} value={outcome.failure.input} />
          )}
          {outcome.failure.stderr ? (
            <ErrorBlock value={outcome.failure.stderr} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Your output" value={outcome.failure.stdout} />
              <Field label="Expected" value={outcome.failure.expected} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
