import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { AUTHOR } from "@/lib/author";
import { personStructuredData } from "@/lib/seo";

/**
 * Author page. Keep the personal facts in lib/author.ts so bylines and
 * structured data stay in sync.
 */
export const metadata: Metadata = {
  title: `About ${AUTHOR.name} | Onlearn`,
  description:
    "Who's building Onlearn, what the guides cover, and how each lesson connects back to a project.",
  alternates: { canonical: "/about" },
  robots: { index: true, follow: true },
  openGraph: {
    title: `About ${AUTHOR.name} | Onlearn`,
    description: "Who's building Onlearn and how the guides are put together.",
    url: "/about",
    siteName: "Onlearn",
    type: "profile",
  },
};

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 pt-12 pb-24">
      <JsonLd data={personStructuredData(AUTHOR)} />

      <header className="border-b border-border pb-8">
        <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">
          About
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-[2.4rem] sm:leading-[1.08]">
          {AUTHOR.name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{AUTHOR.role}</p>
      </header>

      <div className="mt-8 flex flex-col gap-6">
        {AUTHOR.bio.map((paragraph, index) => (
          <p key={index} className="text-base leading-7 text-foreground">
            {paragraph}
          </p>
        ))}

        <section className="mt-2">
          <h2 className="text-lg font-semibold tracking-tight">
            How I write the guides
          </h2>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            I use the guides as working notes for the projects on Onlearn. I
            watch the source lecture, build the project, keep track of the parts
            that slowed me down, and turn those notes into a walkthrough. The
            goal is simple: help you understand the idea well enough to finish
            the project yourself.
          </p>
        </section>

        {AUTHOR.links.length > 0 ? (
          <section className="mt-2">
            <h2 className="text-lg font-semibold tracking-tight">Elsewhere</h2>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {AUTHOR.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                  >
                    {link.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-8">
          <Link
            href="/guides"
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Read the guides
          </Link>
          <Link
            href="/projects"
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Browse projects
          </Link>
        </div>
      </div>
    </main>
  );
}
