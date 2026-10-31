// The languages a learner can pick in the workspace, and everything the editor
// needs to drive them: which runtime worker executes them, which boilerplate
// generator seeds the editor, the CodeMirror mode, runtime capabilities, and
// the per-track offering.
//
// Data-only (no React / CodeMirror / runtime imports - only types) so it's safe
// to import from the server route, which validates draft languages against the
// per-track set. Execution composition (stub/driver) lives in program.ts.

import type { BoilerplateLanguage } from "@/lib/boilerplate";
import type { RuntimeKind } from "./runtime-manager";
import type { FunctionSignature, TrackSlug } from "@/lib/types";

export type EditorLanguageId = "python" | "javascript" | "cpp" | "c" | "go";

export type EditorLanguage = {
  id: EditorLanguageId;
  label: string;
  /** Worker family that executes this language. */
  runtimeKind: RuntimeKind;
  /** Boilerplate generator key. */
  boilerplate: BoilerplateLanguage;
  /** Disambiguates the shared clang worker. */
  clangLang?: "c" | "cpp";
  /**
   * Supports function mode (editor shows only the function; a hidden driver
   * does I/O + canonical serialization). Only the runtimes we verify end-to-end
   * have a function-mode driver today; the rest fall back to stdio mode.
   */
  functionMode: boolean;
  capabilities: {
    /** Needs COOP/COEP cross-origin isolation (threads + SharedArrayBuffer). */
    needsCrossOriginIsolation: boolean;
    kind: "interpreter" | "compiler";
  };
  /**
   * True when the runtime's assets/deps are present so it can execute. Combined
   * with the isolation capability by isAvailable(); see EXECUTION_V2.md.
   * Python/JS run today; C/C++/Go are edit-only until their assets/deps land.
   */
  runnable: boolean;
};

export const EDITOR_LANGUAGES: Record<EditorLanguageId, EditorLanguage> = {
  python: {
    id: "python",
    label: "Python 3",
    runtimeKind: "pyodide",
    boilerplate: "python",
    functionMode: true,
    capabilities: { needsCrossOriginIsolation: false, kind: "interpreter" },
    runnable: true,
  },
  javascript: {
    id: "javascript",
    label: "JavaScript",
    runtimeKind: "js",
    boilerplate: "javascript",
    functionMode: true,
    capabilities: { needsCrossOriginIsolation: false, kind: "interpreter" },
    runnable: true,
  },
  cpp: {
    id: "cpp",
    label: "C++",
    runtimeKind: "clang",
    boilerplate: "cpp",
    clangLang: "cpp",
    // Function-mode driver is verified end-to-end with g++ (scripts/verify-driver).
    functionMode: true,
    // Single-threaded WASI clang (binji/wasm-clang) → no SharedArrayBuffer, so
    // NO cross-origin isolation (keeps CDN Pyodide + Clerk working).
    capabilities: { needsCrossOriginIsolation: false, kind: "compiler" },
    // Single-threaded binji/wasm-clang assets are served from
    // public/wasm/clang/ and wired in app/workers/clang.worker.ts.
    runnable: true,
  },
  c: {
    id: "c",
    label: "C",
    runtimeKind: "clang",
    boilerplate: "c",
    clangLang: "c",
    // C stays stdio mode (a generic C function-mode driver is awkward for
    // list-heavy DSA); shares the clang worker. Enable alongside C++.
    functionMode: false,
    capabilities: { needsCrossOriginIsolation: false, kind: "compiler" },
    runnable: true,
  },
  go: {
    id: "go",
    label: "Go",
    runtimeKind: "go",
    boilerplate: "go",
    functionMode: false,
    // Yaegi is a single WASM module - no isolation required.
    capabilities: { needsCrossOriginIsolation: false, kind: "interpreter" },
    // Assets built + committed (public/wasm/go/{yaegi.wasm,wasm_exec.js}); the
    // runtime is verified headlessly under Node (npm run verify:driver). Runs in
    // stdio mode (fmt.Scan). Rebuild via runtimes/go/build.sh (Go 1.21+).
    runnable: true,
  },
};

export const DEFAULT_LANGUAGE: EditorLanguageId = "python";

/**
 * Languages offered for a track. DS is Python-only (its starter_code is
 * hand-authored Python and the stack is Pyodide's numpy/pandas); DSA generates
 * per-language stubs from the question's `structure`, so it offers the full set.
 */
export function languagesForTrack(track: TrackSlug): EditorLanguage[] {
  if (track === "ds") return [EDITOR_LANGUAGES.python];
  return [
    EDITOR_LANGUAGES.python,
    EDITOR_LANGUAGES.javascript,
    EDITOR_LANGUAGES.cpp,
    EDITOR_LANGUAGES.c,
    EDITOR_LANGUAGES.go,
  ];
}

export function getEditorLanguage(id: string): EditorLanguage {
  return EDITOR_LANGUAGES[id as EditorLanguageId] ?? EDITOR_LANGUAGES.python;
}

// Availability is derived where it's used (the workspace), combining
// `lang.runnable` with `lang.capabilities.needsCrossOriginIsolation` against the
// document's crossOriginIsolated - kept inline there so it stays pure for the
// React Compiler. See EXECUTION_V2.md.

export type IoMode = "function" | "stdio" | "ds";

export type ProblemContext = {
  track: TrackSlug;
  structure?: FunctionSignature;
  starterCode?: string;
};

/**
 * How a problem runs for a given language:
 * - "ds": DS track - hand-authored Python + appended test expression.
 * - "function": structured DSA problem on a function-mode language - hidden
 *   driver does I/O; the learner writes only the function.
 * - "stdio": everything else (void/in-place output, no structure, or a language
 *   without a function-mode driver) - the learner reads stdin / writes stdout.
 */
export function resolveMode(langId: EditorLanguageId, ctx: ProblemContext): IoMode {
  if (ctx.track === "ds") return "ds";
  const outType = ctx.structure?.output_fields?.[0]?.type;
  if (!ctx.structure || !outType || outType === "void") return "stdio";
  return getEditorLanguage(langId).functionMode ? "function" : "stdio";
}
