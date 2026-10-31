// Composes what actually runs for a (language, problem): the editor's starter
// code and the full program handed to the runtime. Centralizes the mode-specific
// logic (function / stdio / ds) so the workspace stays declarative. Client-side
// (pulls in the boilerplate generators); the server route only needs the
// data-only editor-languages module. See EXECUTION_V2.md.

import {
  generateBoilerplate,
  generateDriver,
  generateStub,
} from "@/lib/boilerplate";
import {
  type EditorLanguageId,
  type ProblemContext,
  getEditorLanguage,
  resolveMode,
} from "./editor-languages";
import { normalizePythonSourceWhitespace } from "./python-source";

function normalizeIfPython(langId: EditorLanguageId, source: string): string {
  return langId === "python" ? normalizePythonSourceWhitespace(source) : source;
}

/** Editor starter content for a language + problem. */
export function starterFor(
  langId: EditorLanguageId,
  ctx: ProblemContext,
): string {
  const lang = getEditorLanguage(langId);
  const mode = resolveMode(langId, ctx);
  let starter: string;
  if (mode === "ds") {
    starter = ctx.starterCode || generateBoilerplate("python", ctx.structure);
  } else if (mode === "function") {
    starter = generateStub(lang.boilerplate, ctx.structure);
  } else if (langId === "python" && ctx.starterCode) {
    // stdio: prefer a hand-authored Python starter (some DSA impl problems), else
    // the generated full program for that language.
    starter = ctx.starterCode;
  } else {
    starter = generateBoilerplate(lang.boilerplate, ctx.structure);
  }
  return normalizeIfPython(langId, starter);
}

export type PreparedProgram = {
  /** The full source handed to the runtime (driver-wrapped in function mode). */
  program: string;
  stdin: string;
  /** Runtime-specific extras (e.g. clang `lang`). */
  meta?: Record<string, unknown>;
  /** When true, the runtime's answer is the RESULT_MARKER line (extractResult). */
  functionMode: boolean;
};

export function prepareProgram(
  langId: EditorLanguageId,
  ctx: ProblemContext,
  source: string,
  testInput: string,
): PreparedProgram {
  const lang = getEditorLanguage(langId);
  const mode = resolveMode(langId, ctx);
  const meta = lang.clangLang ? { lang: lang.clangLang } : undefined;
  const sourceForExecution = normalizeIfPython(langId, source);

  if (mode === "ds") {
    // DS: define the function, then append + run the test expression (no stdin).
    return {
      program: `${sourceForExecution}\n\n${normalizePythonSourceWhitespace(testInput)}`,
      stdin: "",
      meta,
      functionMode: false,
    };
  }
  if (mode === "function" && ctx.structure) {
    const d = generateDriver(lang.boilerplate, ctx.structure);
    return {
      program: `${d.prefix}\n${sourceForExecution}\n${d.suffix}`,
      stdin: testInput,
      meta,
      functionMode: true,
    };
  }
  // stdio: the learner's program reads stdin / writes stdout directly.
  return { program: sourceForExecution, stdin: testInput, meta, functionMode: false };
}
