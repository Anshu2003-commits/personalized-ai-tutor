import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Layers3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getGuides } from "@/lib/guides";
import { getProjectCourses } from "@/lib/project-catalog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Build real projects with an AI tutor | Onlearn",
  description:
    "Learn by building. Work through guided, hands-on coding projects with an AI tutor that checks your work against the tests - free to start, and you keep the code.",
  alternates: { canonical: "/projects" },
  openGraph: {
    title: "Build real projects with an AI tutor",
    description:
      "Guided, hands-on coding projects with an AI tutor - free to start, and you keep the code.",
    url: "/projects",
    siteName: "Onlearn",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Build real projects with an AI tutor",
    description: "Guided, hands-on coding projects with an AI tutor.",
  },
};

export default function ProjectsPage() {
  const projectCourses = getProjectCourses();
  const liveCourses = projectCourses.filter(
    ({ liveModules }) => liveModules.length > 0,
  );
  const queuedTitles = projectCourses
    .filter(({ liveModules }) => liveModules.length === 0)
    .map(({ course }) => course.title);
  const guides = getGuides();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-8 pb-24">
      {/* Hero: the pitch, payoff-first. */}
      <header className="max-w-2xl">
        <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Projects
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.05]">
          Build it yourself.
          <br />
          The tutor keeps you honest.
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Guided coding projects with an AI tutor that checks your work against
          the tests. Free to start, and you keep the code.
        </p>
      </header>

      {/* Live track spotlight(s): one compact horizontal card per track. */}
      {liveCourses.length > 0 ? (
        <section className="mt-10 flex flex-col gap-3">
          {liveCourses.map(({ course, firstLiveModule, projectCount }) => {
            const href = `/projects/${course.slug}`;
            const language = firstLiveModule?.projects[0]?.language;
            const meta = [
              language,
              `${projectCount} guided ${projectCount === 1 ? "project" : "projects"}`,
              `${course.modules.length} lectures`,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <article
                key={course.slug}
                className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"
              >
                <Link
                  href={href}
                  aria-label={course.title}
                  className="relative block bg-muted/30"
                >
                  {firstLiveModule ? (
                    <Image
                      src={`https://i.ytimg.com/vi/${firstLiveModule.videoId}/hqdefault.jpg`}
                      alt={`${course.title} thumbnail`}
                      width={480}
                      height={360}
                      className="aspect-video h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center">
                      <Layers3 className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                    Live now
                  </span>
                </Link>

                <div className="flex flex-col p-5">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {course.author}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight">
                    <Link
                      href={href}
                      className="transition-colors hover:text-foreground/80"
                    >
                      {course.title}
                    </Link>
                  </h2>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {course.description}
                  </p>
                  <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                    {meta}
                  </p>
                  <div className="mt-4">
                    <Link
                      href={href}
                      className={cn(buttonVariants(), "group gap-2")}
                    >
                      Start building
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Tease what's next; list queued catalog tracks so none are dropped. */}
          <p className="text-xs text-muted-foreground">
            More tracks coming
            {queuedTitles.length > 0
              ? `: ${queuedTitles.join(", ")}.`
              : " - Data Structures & Algorithms, Data Science."}
          </p>
        </section>
      ) : (
        <p className="mt-10 text-sm text-muted-foreground">
          Project tracks are being set up. Check back shortly.
        </p>
      )}

      {/* Read-first funnel, kept to a single line. */}
      {guides.length > 0 ? (
        <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-5 text-sm">
          <span className="text-muted-foreground">Prefer to read first?</span>
          {guides.map((guide) => (
            <Link
              key={guide.meta.slug}
              href={`/guides/${guide.meta.slug}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {guide.meta.title}
            </Link>
          ))}
          <Link
            href="/guides"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            All guides &rarr;
          </Link>
        </div>
      ) : null}
    </main>
  );
}
