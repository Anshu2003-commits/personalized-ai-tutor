import Link from "next/link";
import { SignUpButton, Show } from "@clerk/nextjs";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ClosingCta() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-24 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Start the habit today.
        </h2>
        <p className="mt-4 max-w-md text-muted-foreground">
          Free to start - 100 AI messages every week, all content unlocked.
          Upgrade anytime for unlimited mentoring and multi-language execution.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <Button className="h-11 px-6 text-sm">Get started - free</Button>
            </SignUpButton>
            <Link
              href="/ds"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              browse Data Science →
            </Link>
          </Show>
          <Show when="signed-in">
            <Link
              href="/"
              className={cn(buttonVariants(), "h-11 px-6 text-sm")}
            >
              Continue learning
            </Link>
          </Show>
        </div>

        <p className="mt-6 font-mono text-[11px] text-muted-foreground">
          no credit card · cancel anytime
        </p>
      </div>
    </section>
  );
}
