import type { Question } from "./types";

export type NormalizedExample = {
  input?: string;
  output?: string;
  explanation?: string;
};

/**
 * The catalog stores `example` in several shapes: an object of
 * { input, output, reasoning } (the DS norm), one { explanation, input, output }
 * variant, an empty {}, or - defensively - a plain string. Normalize them all
 * to one render-safe shape; return null when there is nothing to show.
 * `reasoning` maps to `explanation`. Leaf values are coerced with String().
 */
export function normalizeExample(
  example: Question["example"],
): NormalizedExample | null {
  if (example == null) return null;

  if (typeof example === "string") {
    const text = example.trim();
    return text ? { explanation: text } : null;
  }

  if (typeof example !== "object") return null;

  const leaf = (v: unknown): string | undefined => {
    if (v == null) return undefined;
    const s = String(v);
    return s.trim() ? s : undefined;
  };

  const out: NormalizedExample = {};
  const input = leaf(example.input);
  const output = leaf(example.output);
  const explanation = leaf(example.explanation) ?? leaf(example.reasoning);
  if (input !== undefined) out.input = input;
  if (output !== undefined) out.output = output;
  if (explanation !== undefined) out.explanation = explanation;

  return Object.keys(out).length > 0 ? out : null;
}
