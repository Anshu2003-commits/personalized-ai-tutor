import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold tracking-tight">Onlearn</span>
          <span className="text-xs text-muted-foreground">
            Brilliant for engineers, with a real AI mentor.
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/dsa" className="transition-colors hover:text-foreground">
            DSA
          </Link>
          <Link href="/ds" className="transition-colors hover:text-foreground">
            Data Science
          </Link>
          <Link href="#faq" className="transition-colors hover:text-foreground">
            FAQ
          </Link>
          <Link
            href="/sign-in"
            className="transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-6 py-4">
          <p className="font-mono text-[10px] text-muted-foreground">
            © 2026 Onlearn
          </p>
        </div>
      </div>
    </footer>
  );
}
