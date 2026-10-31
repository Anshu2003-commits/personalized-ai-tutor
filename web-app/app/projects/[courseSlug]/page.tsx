import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock, Lock } from "lucide-react";
import { ProjectCourseResumeCta } from "@/components/project-course-resume-cta";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumb } from "@/components/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { getGuidesForCourse } from "@/lib/guides";
import type { GuideDoc } from "@/lib/guide-types";
import {
  getProjectCourse,
  getProjectCourses,
  getProjectModule,
  getLessonHref,
} from "@/lib/project-catalog";
import { trackStructuredData } from "@/lib/seo";
import { cn } from "@/lib/utils";

type ProjectCoursePageProps = {
  params: Promise<{
    courseSlug: string;
  }>;
};

type ResumeTarget = {
  moduleSlug: string;
  moduleLabel: string;
  href: string;
};

function getModuleLabel(moduleSlug: string, moduleTitle: string) {
  const slugLabel = moduleSlug
    .replace(/^\d+-/, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return slugLabel || moduleTitle;
}

export function generateStaticParams() {
  return getProjectCourses().map(({ course }) => ({
    courseSlug: course.slug,
  }));
}

export async function generateMetadata({
  params,
}: ProjectCoursePageProps): Promise<Metadata> {
  const { courseSlug } = await params;

  try {
    const course = getProjectCourse(courseSlug);
    const path = `/projects/${courseSlug}`;

    return {
      title: `${course.title} - ${course.author}'s course as guided projects | Onlearn`,
      description: course.description,
      alternates: { canonical: path },
      robots: { index: true, follow: true },
      openGraph: {
        title: course.title,
        description: course.description,
        url: path,
        siteName: "Onlearn",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: course.title,
        description: course.description,
      },
    };
  } catch {
    return {
      title: "Project track not found - Onlearn",
    };
  }
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

/** The conversion box: resume-aware CTA, the honest "free" line, and the
 *  companion guides for this track. Rendered twice (mobile + sticky desktop). */
function StartBox({
  courseSlug,
  defaultHref,
  defaultLabel,
  targets,
  guides,
}: {
  courseSlug: string;
  defaultHref: string;
  defaultLabel: string;
  targets: ResumeTarget[];
  guides: GuideDoc[];
}) {
  return (
    <div>
      <h2 className="text-base font-semibold tracking-tight">Start the track</h2>
      <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
        Work through it locally with your AI tutor. It checks each project
        against the tests.
      </p>
      <div className="mt-4">
        <ProjectCourseResumeCta
          courseSlug={courseSlug}
          defaultHref={defaultHref}
          defaultLabel={defaultLabel}
          targets={targets}
        />
      </div>
      <p className="mt-2.5 font-mono text-[11px] text-muted-foreground">
        Free · no signup to start · you keep the code
      </p>

      {guides.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <SectionLabel>Companion guides</SectionLabel>
          <ul className="mt-3 flex flex-col gap-3">
            {guides.map((guide) => (
              <li key={guide.meta.slug}>
                <Link
                  href={`/guides/${guide.meta.slug}`}
                  className="group flex items-start gap-2.5 text-sm text-foreground"
                >
                  <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="min-w-0">
                    <span className="block font-medium leading-snug underline-offset-4 group-hover:underline">
                      {guide.meta.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {guide.meta.readingMinutes} min read
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default async function ProjectCoursePage({
  params,
}: ProjectCoursePageProps) {
  const { courseSlug } = await params;
  let course: ReturnType<typeof getProjectCourse>;

  try {
    course = getProjectCourse(courseSlug);
  } catch {
    notFound();
  }

  const roadmapModules = course.modules.map((moduleItem) => {
    if (!moduleItem.hasContent) {
      return { ...moduleItem, projects: [] };
    }

    return {
      ...moduleItem,
      projects: getProjectModule(course.slug, moduleItem.slug).projects,
    };
  });

  const trackConcepts = Array.from(
    new Set(
      roadmapModules.flatMap((moduleItem) =>
        moduleItem.projects.flatMap((project) => project.learn?.concepts ?? []),
      ),
    ),
  );

  const guides = getGuidesForCourse(course.slug);

  const firstLiveModule = roadmapModules.find((moduleItem) => moduleItem.hasContent);
  const defaultResumeHref = firstLiveModule
    ? getLessonHref(course.slug, firstLiveModule.slug)
    : course.source;
  const resumeTargets = roadmapModules
    .filter((moduleItem) => moduleItem.hasContent && moduleItem.projects[0])
    .map((moduleItem) => ({
      moduleSlug: moduleItem.slug,
      moduleLabel: getModuleLabel(moduleItem.slug, moduleItem.title),
      href: getLessonHref(course.slug, moduleItem.slug),
    }));
  const defaultLabel = firstLiveModule
    ? `Start ${getModuleLabel(firstLiveModule.slug, firstLiveModule.title)}`
    : "Open course";

  const startBox = (
    <StartBox
      courseSlug={course.slug}
      defaultHref={defaultResumeHref}
      defaultLabel={defaultLabel}
      targets={resumeTargets}
      guides={guides}
    />
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-5 pb-24">
      <JsonLd data={trackStructuredData({ course, concepts: trackConcepts })} />

      {/* Slim top bar: back + breadcrumb (matches the project detail page). */}
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <Link
          href="/projects"
          aria-label="Back to projects"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Breadcrumb
          items={[
            { label: "Projects", href: "/projects" },
            { label: course.title },
          ]}
        />
      </div>

      {/* Two-column: roadmap (left, the mechanics) + sticky Start box (right). */}
      <div className="mt-8 grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
        <div className="flex min-w-0 flex-col gap-10">
          <header>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.05]">
              {course.title}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Based on{" "}
              <a
                href={course.source}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {course.author}&rsquo;s course
              </a>
              .
            </p>
            <p className="mt-4 text-base leading-7 text-foreground">
              {course.description}
            </p>
          </header>

          {/* On mobile the Start box rides under the header, above the roadmap. */}
          <div className="lg:hidden">{startBox}</div>

          <section aria-labelledby="roadmap-heading">
            <SectionLabel>Roadmap</SectionLabel>
            <h2 id="roadmap-heading" className="mt-2 text-xl font-semibold">
              Build from micrograd to GPT.
            </h2>

            <div className="relative mt-5 flex flex-col gap-3">
              <div className="absolute left-5 top-6 hidden h-[calc(100%-3rem)] w-px bg-border sm:block" />
              {roadmapModules.map((moduleItem) => {
                const isLive = moduleItem.hasContent;
                const moduleHref = isLive
                  ? getLessonHref(course.slug, moduleItem.slug)
                  : moduleItem.videoUrl;

                return (
                  <article
                    key={moduleItem.slug}
                    className={cn(
                      "relative rounded-lg border bg-card p-4",
                      isLive ? "border-border" : "border-dashed border-border bg-muted/20",
                    )}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div
                        className={cn(
                          "z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background font-mono text-xs font-medium",
                          isLive
                            ? "border-foreground text-foreground"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {String(moduleItem.order).padStart(2, "0")}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                  isLive
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                                    : "border-border bg-background text-muted-foreground",
                                )}
                              >
                                {isLive ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : (
                                  <Lock className="h-3 w-3" />
                                )}
                                {isLive ? "Live" : "Coming soon"}
                              </span>
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                Lecture {moduleItem.order}
                              </span>
                            </div>
                            <h3 className="mt-2 text-lg font-semibold leading-snug">
                              {moduleItem.title}
                            </h3>
                          </div>

                          <Link
                            href={moduleHref}
                            target={isLive ? undefined : "_blank"}
                            rel={isLive ? undefined : "noreferrer"}
                            className={cn(
                              buttonVariants({ variant: isLive ? "outline" : "ghost" }),
                              "h-9 shrink-0 gap-2",
                            )}
                          >
                            {isLive ? "Open" : "Watch"}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>

                        {moduleItem.projects.length > 0 ? (
                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            {moduleItem.projects.map((project) => (
                              <Link
                                key={project.slug}
                                href={`/projects/${course.slug}/${project.slug}`}
                                className="rounded-md border border-border bg-background p-3 transition-colors hover:bg-accent"
                              >
                                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                  Project {project.order} · {project.language}
                                </p>
                                <p className="mt-1 text-sm font-medium">
                                  {project.title}
                                </p>
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {trackConcepts.length > 0 ? (
            <section>
              <SectionLabel>What you&rsquo;ll learn</SectionLabel>
              <div className="mt-3 flex flex-wrap gap-2">
                {trackConcepts.map((concept) => (
                  <span
                    key={concept}
                    className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground"
                  >
                    {concept}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Sticky Start box (desktop). */}
        <aside className="hidden lg:block">
          <div className="lg:sticky lg:top-6">{startBox}</div>
        </aside>
      </div>
    </main>
  );
}
