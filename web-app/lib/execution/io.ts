// Function-mode I/O helpers shared by the generated drivers and the UI.
//
// In `function` mode the learner edits only the function body; a hidden driver
// reads stdin, calls the function, and prints the return value as canonical JSON
// on a single line prefixed by RESULT_MARKER. Anything the learner prints
// themselves (debugging) is ordinary stdout without the marker, so we can split
// the two cleanly. See EXECUTION_V2.md.

import { type LooseValue, serializeValue } from "./value";
import type { FunctionSignature } from "@/lib/types";

// A control-char sentinel that can't occur in normal program output or JSON.
export const RESULT_MARKER = "ONLEARN_RESULT";

/**
 * Split a function-mode program's stdout into the judged answer (the marker
 * line, canonical JSON) and the learner's own console output (everything else).
 * If no marker is present (e.g. the program errored before the driver ran), the
 * whole stdout is treated as the answer so error text still surfaces.
 */
export function extractResult(stdout: string): {
  answer: string;
  userOutput: string;
} {
  const lines = stdout.split("\n");
  const idx = lines.findIndex((l) => l.includes(RESULT_MARKER));
  if (idx === -1) return { answer: stdout.trim(), userOutput: "" };
  const line = lines[idx];
  const answer = line.slice(line.indexOf(RESULT_MARKER) + RESULT_MARKER.length);
  const userOutput = lines
    .filter((_, i) => i !== idx)
    .join("\n")
    .trim();
  return { answer, userOutput };
}

// ---- display: turn the line-based stdin into named, human-readable args ----

type Reader = () => string;

function readScalar(type: string, raw: string): LooseValue {
  const s = raw.trim();
  if (type === "int") return parseInt(s, 10);
  if (type === "float" || type === "double") return parseFloat(s);
  if (type === "bool") return /^(true|1|yes)$/i.test(s);
  return raw; // string / char
}

function readField(type: string, next: Reader): LooseValue {
  // list<list<...>> - "<rows> <cols>" then <rows> value lines
  if (type.startsWith("list<list<")) {
    const inner = type.slice(5, -1); // list<...>
    const elem = inner.slice(5, -1); // scalar
    const rows = parseInt((next().trim().split(/\s+/)[0] ?? "0"), 10) || 0;
    const out: LooseValue[] = [];
    for (let r = 0; r < rows; r++) {
      out.push(next().trim().split(/\s+/).filter(Boolean).map((t) => readScalar(elem, t)));
    }
    return out;
  }
  // list<...> / ListNode / TreeNode - a count line then a values line
  if (type.startsWith("list<") || type === "ListNode" || type === "TreeNode") {
    next(); // count (length is recoverable from the values line)
    const elem = type.startsWith("list<") ? type.slice(5, -1) : "int";
    return next()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => readScalar(elem, t));
  }
  return readScalar(type, next());
}

/**
 * Best-effort parse of a test case's stdin into `{ name, value }` pairs for the
 * console ("nums = [2, 7, 11, 15], target = 9" instead of a raw stream).
 * Display-only: irregular inputs fall back to showing the raw text.
 */
export function parseInputsForDisplay(
  structure: FunctionSignature | undefined,
  stdin: string,
): { name: string; value: string }[] | null {
  if (!structure?.input_fields?.length) return null;
  const lines = stdin.split("\n");
  let i = 0;
  const next: Reader = () => (i < lines.length ? lines[i++] : "");
  try {
    return structure.input_fields.map((f) => ({
      name: f.name,
      value: serializeValue(readField(f.type, next)),
    }));
  } catch {
    return null;
  }
}
