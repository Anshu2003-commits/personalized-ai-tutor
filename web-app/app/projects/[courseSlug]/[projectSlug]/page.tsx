import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Check } from "lucide-react";
import { ProjectVisitRecorder } from "@/components/project-course-resume-cta";
import { ProjectStart } from "@/components/project-start";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumb } from "@/components/breadcrumb";
import { getGuideForProject } from "@/lib/guides";
import {
  getCourseModules,
  getProjectCourse,
  getProjectCourses,
  type ModuleManifest,
  type ProjectManifest,
} from "@/lib/project-catalog";
import { projectStructuredData } from "@/lib/seo";

type ProjectPageProps = {
  params: Promise<{
    courseSlug: string;
    projectSlug: string;
  }>;
};

type ResolvedProject = {
  module: ModuleManifest;
  project: ProjectManifest;
};

function findProject(
  courseSlug: string,
  projectSlug: string,
): ResolvedProject | null {
  let modules: ModuleManifest[];
  try {
    modules = getCourseModules(courseSlug);
  } catch {
    return null;
  }

  for (const moduleItem of modules) {
    const project = moduleItem.projects.find((item) => item.slug === projectSlug);
    if (project) {
      return { module: moduleItem, project };
    }
  }

  return null;
}

export function generateStaticParams() {
  const params: { courseSlug: string; projectSlug: string }[] = [];

  for (const { course } of getProjectCourses()) {
    let modules: ModuleManifest[];
    try {
      modules = getCourseModules(course.slug);
    } catch {
      continue;
    }
    for (const moduleItem of modules) {
      for (const project of moduleItem.projects) {
        params.push({ courseSlug: course.slug, projectSlug: project.slug });
      }
    }
  }

  return params;
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { courseSlug, projectSlug } = await params;
  const found = findProject(courseSlug, projectSlug);

  if (!found) {
    return { title: "Project not found | Onlearn" };
  }

  const language =
    found.project.language.charAt(0).toUpperCase() +
    found.project.language.slice(1);
  const description = found.project.summary;
  const path = `/projects/${courseSlug}/${projectSlug}`;

  return {
    title: `${found.project.title}: guided ${language} project with an AI tutor | Onlearn`,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      title: found.project.title,
      description,
      url: path,
      siteName: "Onlearn",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: found.project.title,
      description,
    },
  };
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { courseSlug, projectSlug } = await params;
  const found = findProject(courseSlug, projectSlug);

  if (!found) {
    notFound();
  }

  let course;
  try {
    course = getProjectCourse(courseSlug);
  } catch {
    notFound();
  }

  const { module: moduleItem, project } = found;
  const pitch = project.pitch;
  const companionGuide = getGuideForProject(course.slug, project.slug);
  const languageLabel =
    project.language.charAt(0).toUpperCase() + project.language.slice(1);
  const moduleProjects = [...moduleItem.projects].sort(
    (a, b) => a.order - b.order,
  );
  const currentIndex = moduleProjects.findIndex(
    (item) => item.slug === project.slug,
  );
  const nextProject =
    currentIndex >= 0 ? moduleProjects[currentIndex + 1] : undefined;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-5 pb-24">
      <ProjectVisitRecorder courseSlug={course.slug} moduleSlug={moduleItem.slug} />
      <JsonLd
        data={projectStructuredData({ course, module: moduleItem, project })}
      />

      {/* Slim top bar: back + breadcrumb */}
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <Link
          href={`/projects/${course.slug}`}
          aria-label={`Back to ${course.title}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Breadcrumb
          items={[
            { label: "Projects", href: "/projects" },
            { label: course.title, href: `/projects/${course.slug}` },
            { label: project.title },
          ]}
        />
      </div>

      {/* Two-column body: article (left) + sticky action box (right) */}
      <div className="mt-8 grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
        <article className="flex min-w-0 flex-col gap-10">
          <header>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.05]">
              {project.title}
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
            <p className="mt-4 font-mono text-[11px] text-muted-foreground">
              {languageLabel} · ~{project.estimatedMinutes} min · tests verify
              your work
            </p>
          </header>

          {/* On mobile the action box rides under the title, above the article */}
          <div className="lg:hidden">
            <ProjectStart repoUrl={project.repoUrl} />
          </div>

          {companionGuide ? (
            <Link
              href={`/guides/${companionGuide.meta.slug}`}
              className="group flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-accent"
            >
              <BookOpen className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="min-w-0 flex-1 text-sm text-foreground">
                <span className="text-muted-foreground">Prefer to read first? </span>
                <span className="font-medium">{companionGuide.meta.title}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          ) : null}

          {/* Article content. Placeholders below; writing drops in here,
              with diagrams/media between sections. */}
          {pitch?.body ? (
            <section>
              <SectionLabel>What you&rsquo;ll build</SectionLabel>
              <p className="mt-3 text-base leading-7 text-foreground">
                {pitch.body}
              </p>
            </section>
          ) : null}

          {project.learn ? (
            <section>
              <SectionLabel>What you&rsquo;ll learn</SectionLabel>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                By the end, you&rsquo;ll be able to:
              </p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {project.learn.outcomes.map((outcome) => (
                  <li
                    key={outcome}
                    className="flex gap-2.5 text-sm leading-6 text-foreground"
                  >
                    <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
              {project.learn.prerequisites ? (
                <p className="mt-5 text-sm leading-6 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Before you start:{" "}
                  </span>
                  {project.learn.prerequisites}
                </p>
              ) : null}
            </section>
          ) : null}

          {pitch?.tutorIntro ? (
            <section>
              <SectionLabel>Your AI tutor</SectionLabel>
              <p className="mt-3 text-base leading-7 text-foreground">
                {pitch.tutorIntro}
              </p>
              {/* MEDIA SLOT (high value): a 20-30s screen recording of a real
                  tutor session in the IDE. Drop a clip at
                  /public/projects/<course>/<project>/tutor-demo.mp4. */}
            </section>
          ) : null}

          {nextProject ? (
            <Link
              href={`/projects/${course.slug}/${nextProject.slug}`}
              className="group flex items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>
                <span className="font-mono text-[10px] uppercase tracking-widest">
                  Next ·{" "}
                </span>
                <span className="font-medium">{nextProject.title}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : null}
        </article>

        {/* Sticky action box (desktop) */}
        <aside className="hidden lg:block">
          <div className="lg:sticky lg:top-6">
            <ProjectStart repoUrl={project.repoUrl} />
          </div>
        </aside>
      </div>
    </main>
  );
}
