"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const TRACK_OPTIONS = [
  {
    value: "dsa",
    title: "DSA",
    subtitle: "Data Structures & Algorithms",
    description: "Arrays, trees, graphs, sorting, dynamic programming.",
    redirect: "/",
  },
  {
    value: "ds",
    title: "Data Science",
    subtitle: "Statistics, ML, Pandas, NumPy",
    description:
      "Linear algebra, probability, data wrangling, machine learning.",
    redirect: "/",
  },
  {
    value: "both",
    title: "Both",
    subtitle: "DSA + Data Science",
    description: "Full access to both tracks. You can switch anytime.",
    redirect: "/",
  },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function pick(value: string, redirect: string) {
    setLoading(value);
    try {
      const res = await fetch("/api/user/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferredTrack: value }),
      });
      if (!res.ok) throw new Error("failed");
      router.push(redirect);
    } catch {
      setLoading(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        One quick question
      </p>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        What brought you to Onlearn?
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Pick your starting track. You can always switch later.
      </p>

      <div className="mt-10 flex w-full flex-col gap-3">
        {TRACK_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => pick(opt.value, opt.redirect)}
            disabled={loading !== null}
            className={
              "flex flex-col items-start rounded-md border border-border px-5 py-4 text-left transition-colors hover:bg-accent/40 disabled:opacity-50 " +
              (loading === opt.value ? "bg-accent/40" : "")
            }
          >
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium">{opt.title}</span>
              <span className="text-xs text-muted-foreground">
                {opt.subtitle}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {opt.description}
            </p>
          </button>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="mt-8 text-xs text-muted-foreground"
        onClick={() => router.push("/")}
        disabled={loading !== null}
      >
        Skip for now
      </Button>
    </main>
  );
}
