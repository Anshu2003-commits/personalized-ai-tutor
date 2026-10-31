import Link from "next/link";
import { SignUpButton, Show } from "@clerk/nextjs";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Screenshot from "@/components/landing/screenshot";

export default function Hero() {
  return (
    <section className="px-6 pt-24 pb-16 sm:pt-32">
      {/* COPY: all text below is yours to rewrite. */}
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          DSA + Data Science + hands-on projects
        </p>

        {/* COPY: alternatives - "Get good at DSA without grinding alone." /
            "Stop grinding LeetCode. Start actually learning." */}
        <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          The coding mentor{" "}
          <span className="text-muted-foreground">you wish you had.</span>
        </h1>

        <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
          Build a daily habit of solving real DSA and Data Science problems. A
          Socratic AI mentor guides you through each one - and runs your code
          against real tests.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <Button className="h-11 px-6 text-sm">Get started - free</Button>
            </SignUpButton>
            <Link
              href="/projects"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Projects →
            </Link>
          </Show>
          <Show when="signed-in">
            <Link
              href="/"
              className={cn(buttonVariants(), "h-11 px-6 text-sm")}
            >
              Continue learning
            </Link>
            <Link
              href="/projects"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Projects →
            </Link>
          </Show>
        </div>

        <p className="mt-10 font-mono text-[11px] text-muted-foreground">
          440 DSA + 631 Data Science problems · 100 AI messages free every week · no credit card
        </p>
      </div>

      {/* ASSET: the hero product shot - the 3-pane solve view. */}
      <div className="mx-auto mt-16 w-full max-w-5xl">
        <Screenshot
          src="/landing/hero-solve-view.png"
          alt="Solve view - problem, code editor, and mentor chat"
          width={1916}
          height={961}
          ratio="1916 / 961"
        />
      </div>
    </section>
  );
}
