// Language-agnostic correctness check. Compares a program's stdout against the
// expected output by VALUE, not by text: structured outputs (numbers, bools,
// lists, matrices, objects) compare structurally - so cross-language formatting
// and whitespace differences don't matter and floats use a tolerance - while
// free-text outputs fall back to an exact trimmed-string compare.
//
// See EXECUTION_V2.md.

import {
  type LooseValue,
  deepEqual,
  isStructural,
  parseValue,
  toDisplay,
} from "./value";

export type JudgeOptions = { floatTol?: number };

export function judge(
  actual: string,
  expected: unknown,
  opts: JudgeOptions = {},
): boolean {
  const tol = opts.floatTol ?? 1e-6;
  const a = parseValue(actual);
  const e = parseValue(expected);

  if (isStructural(a) && isStructural(e)) {
    return deepEqual(a.value as LooseValue, e.value as LooseValue, tol);
  }
  // At least one side is free text. Compare by content: a JSON/Python string
  // literal (e.g. the driver's `json.dumps("hi")` -> `"hi"`) parses to its
  // unquoted text, so `"hi"` matches `hi`. Non-text sides use their display.
  const canon = (p: typeof a, raw: unknown): string =>
    p.type === "text" ? p.value : toDisplay(raw);
  return canon(a, actual).trim() === canon(e, expected).trim();
}
