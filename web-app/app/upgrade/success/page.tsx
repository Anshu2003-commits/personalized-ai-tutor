import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function UpgradeSuccessPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Welcome
      </p>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        You&apos;re all set.
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Unlimited AI tutor is now active. Your mentor is ready whenever you are.
      </p>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
        <Link href="/" className={cn(buttonVariants({ size: "lg" }))}>
          Continue learning
        </Link>
        <Link
          href="/ds"
          className={cn(buttonVariants({ size: "lg", variant: "ghost" }))}
        >
          Data Science
        </Link>
      </div>

      <p className="mt-8 text-[10px] text-muted-foreground">
        Manage your subscription anytime from Settings.
      </p>
    </main>
  );
}
