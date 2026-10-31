"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type GuideQuizProps = {
  prompt: ReactNode;
  hint?: ReactNode;
  answer: ReactNode;
};

/**
 * An inline self-check. The answer stays collapsed until the reader reveals it.
 */
export function GuideQuiz({ prompt, hint, answer }: GuideQuizProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-5">
      <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-emerald-400">
        Quick check
      </p>
      <p className="mt-2.5 text-[15px] font-medium leading-7 text-foreground">
        {prompt}
      </p>

      {hint ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          <span className="font-medium text-foreground">Hint: </span>
          {hint}
        </p>
      ) : null}

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-4 inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          Reveal answer
        </button>
      ) : null}

      <div
        aria-hidden={!revealed}
        className={`grid transition-all duration-300 ${
          revealed ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="border-l-2 border-emerald-500/60 pl-4 text-[15px] leading-7 text-foreground">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}
