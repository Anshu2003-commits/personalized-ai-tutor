import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getGuides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Guides: learn by building | Onlearn",
  description:
    "Project companion guides for Onlearn: read the core idea, follow the important code, then build it yourself.",
  alternates: { canonical: "/guides" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Onlearn guides",
    description:
      "Project companion guides that explain the ideas before you build.",
    url: "/guides",
    siteName: "Onlearn",
    type: "website",
  },
};

export default function GuidesIndexPage() {
  const guides = getGuides();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-12 pb-24">
      <header className="border-b border-border pb-8">
        <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">
          Guides
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-[2.4rem] sm:leading-[1.08]">
          Learn it by building it
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Short companion notes for Onlearn projects. Read the idea, follow the
          key code, then move into the guided build when you are ready.
        </p>
      </header>

      <ul className="mt-8 flex flex-col">
        {guides.map((guide) => (
          <li key={guide.meta.slug}>
            <Link
              href={`/guides/${guide.meta.slug}`}
              className="group flex flex-col gap-2 border-b border-border py-7 transition-colors hover:bg-accent/30"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-medium tracking-tight text-foreground">
                  {guide.meta.title}
                </h2>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {guide.meta.description}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {guide.meta.level} · {guide.meta.readingMinutes} min read
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
