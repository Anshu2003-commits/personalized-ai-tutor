"use client";

import { useCallback, useState } from "react";
import { ArrowRight, Check, Copy } from "lucide-react";

type ProjectStartProps = {
  repoUrl?: string;
};

const ctaClass =
  "group inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-gradient-to-b from-emerald-500 to-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition-all hover:from-emerald-400 hover:to-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be unavailable in locked-down browser contexts.
    }
  }, [command]);

  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-border bg-muted/30">
      <div className="min-w-0 flex-1 overflow-x-auto px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <code className="block whitespace-nowrap font-mono text-xs leading-5 text-foreground">
          {command}
        </code>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy command"}
        title={copied ? "Copied" : "Copy"}
        className="flex w-9 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

export function ProjectStart({ repoUrl }: ProjectStartProps) {
  if (!repoUrl) {
    return (
      <p className="text-sm text-muted-foreground">
        This project&rsquo;s repo is being set up. Check back shortly.
      </p>
    );
  }

  const base = repoUrl.replace(/\.git$/, "");
  const templateUrl = `${base}/generate`;
  const clonePublic = `git clone ${base}`;

  return (
    <div>
      <h2 className="text-base font-semibold tracking-tight">Start building</h2>
      <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
        Use the template, open it in your editor, and tell your AI tutor to take
        it from there.
      </p>

      <a
        href={templateUrl}
        target="_blank"
        rel="noreferrer"
        className={`mt-4 ${ctaClass}`}
      >
        Use this template
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </a>
      <p className="mt-2.5 font-mono text-[11px] text-muted-foreground">
        Free · no signup to start · you keep the code
      </p>

      <details className="mt-4">
        <summary className="cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          Just want to read the code first?
        </summary>
        <div className="mt-3 flex max-w-xs flex-col gap-2">
          <p className="text-xs leading-5 text-muted-foreground">
            Clone it locally - no GitHub account needed. Your changes stay on
            your machine, so use the template above to keep your progress.
          </p>
          <CommandBlock command={clonePublic} />
        </div>
      </details>
    </div>
  );
}
