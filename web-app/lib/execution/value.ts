// Canonical value model for language-agnostic judging + display.
//
// The problem this solves: every language formats output differently (Python
// `print(*list)` -> "1 2 3", C++ might print "[1, 2, 3]", the catalog stores
// some expected outputs as JSON arrays and some as Python-repr strings), and the
// old judge string-compared raw stdout - so non-Python output never matched and
// the ~53 catalog questions whose expected_output is a non-string crashed on
// `.trim()`. parseValue() normalizes all of these into one structured value so
// the judge can compare by value. See EXECUTION_V2.md.

export type LooseValue =
  | null
  | boolean
  | number
  | string
  | LooseValue[]
  | { [key: string]: LooseValue };

export type ParseResult =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "null"; value: null }
  | { type: "array"; value: LooseValue[] }
  | { type: "object"; value: Record<string, LooseValue> }
  | { type: "text"; value: string };

// A standalone numeric token (int, float, scientific). Used for the
// space-separated-numbers and bare-scalar fallbacks.
const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function classify(v: LooseValue): ParseResult {
  if (v === null) return { type: "null", value: null };
  if (typeof v === "boolean") return { type: "boolean", value: v };
  if (typeof v === "number") return { type: "number", value: v };
  if (Array.isArray(v)) return { type: "array", value: v };
  if (typeof v === "object") {
    return { type: "object", value: v as Record<string, LooseValue> };
  }
  // A string is always compared as text, never coerced to a structural match.
  return { type: "text", value: v };
}

// Best-effort Python-repr -> JSON. Good enough for the catalog's outputs; any
// failure falls through to the next strategy (and ultimately to plain text).
function pythonReprToJson(s: string): string {
  return s
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null")
    .replace(/'/g, '"');
}

function tryJson(s: string): { ok: true; value: LooseValue } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(s) as LooseValue };
  } catch {
    return { ok: false };
  }
}

/**
 * Parse a runtime/catalog value into a structured form. Accepts:
 * already-parsed JS values, strict JSON, Python repr (`[1, 2]`, `True`, `'x'`),
 * Python's `print(*list)` space-separated numbers, and bare scalars. Anything
 * that isn't cleanly one of those - and any string literal - becomes `text`.
 */
export function parseValue(input: unknown): ParseResult {
  if (typeof input !== "string") return classify(input as LooseValue);

  const s = input.trim();
  if (s === "") return { type: "text", value: "" };

  // 1) strict JSON, then 2) Python-repr -> JSON
  let parsed = tryJson(s);
  if (!parsed.ok) parsed = tryJson(pythonReprToJson(s));
  if (parsed.ok) {
    // A parsed *string* ("hi" / 'hi') is still compared as text, not structurally.
    if (typeof parsed.value === "string") {
      return { type: "text", value: parsed.value };
    }
    return classify(parsed.value);
  }

  // 3) whitespace-separated numbers - Python's `print(*list)` form
  const tokens = s.split(/\s+/);
  if (tokens.length > 1 && tokens.every((t) => NUMERIC.test(t))) {
    return { type: "array", value: tokens.map(Number) };
  }

  // 4) a bare numeric scalar JSON didn't catch (rare)
  if (NUMERIC.test(s)) return { type: "number", value: Number(s) };

  // 5) free text
  return { type: "text", value: s };
}

const STRUCTURAL = new Set(["number", "boolean", "null", "array", "object"]);

/** True when a value compares structurally (i.e. not free text). */
export function isStructural(p: ParseResult): boolean {
  return STRUCTURAL.has(p.type);
}

/** Structural deep-equality; numbers compare within `floatTol`. */
export function deepEqual(a: LooseValue, b: LooseValue, floatTol = 1e-6): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= floatTol;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((x, i) => deepEqual(x, b[i], floatTol));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(b, k) &&
        deepEqual(
          (a as Record<string, LooseValue>)[k],
          (b as Record<string, LooseValue>)[k],
          floatTol,
        ),
    );
  }
  return a === b; // string === string, boolean === boolean
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  // 6 significant figures, trailing zeros trimmed (EXECUTION_V2 decision C).
  return String(Number(n.toPrecision(6)));
}

/** Canonical, human-readable serialization (nested strings are quoted). */
export function serializeValue(v: LooseValue): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return formatNumber(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(serializeValue).join(", ")}]`;
  return `{${Object.entries(v)
    .map(([k, x]) => `${JSON.stringify(k)}: ${serializeValue(x)}`)
    .join(", ")}}`;
}

/**
 * Display form for a raw catalog/runtime value: a top-level string is shown
 * as-is (no quotes); everything else is canonically serialized. Keeps the UI
 * from rendering a raw array/object and avoids `.trim()`-on-non-string crashes.
 */
export function toDisplay(raw: unknown): string {
  if (typeof raw === "string") return raw;
  return serializeValue(raw as LooseValue);
}
