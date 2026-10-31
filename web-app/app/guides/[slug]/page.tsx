import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { GuideBody } from "@/components/guide-body";
import { JsonLd } from "@/components/json-ld";
import { AUTHOR } from "@/lib/author";
import { getGuide, getGuideSlugs } from "@/lib/guides";
import type { GuideMeta } from "@/lib/guide-types";
import {
  getCourseModules,
  type ProjectManifest,
} from "@/lib/project-catalog";
import { guideStructuredData } from "@/lib/seo";

type GuidePageProps = {
  params: Promise<{ slug: string }>;
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function relatedProject(meta: GuideMeta): ProjectManifest | null {
  try {
    for (const moduleItem of getCourseModules(meta.relatedCourseSlug)) {
      const project = moduleItem.projects.find(
        (item) => item.slug === meta.relatedProjectSlug,
      );
      if (project) return project;
    }
  } catch {
    return null;
  }
  return null;
}

export function generateStaticParams() {
  return getGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);

  if (!guide) {
    return { title: "Guide not found | Onlearn" };
  }

  const { meta } = guide;
  const path = `/guides/${meta.slug}`;

  return {
    title: `${meta.title} | Onlearn`,
    description: meta.description,
    keywords: meta.keywords,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: path,
      siteName: "Onlearn",
      type: "article",
      publishedTime: meta.datePublished,
      modifiedTime: meta.dateModified,
      authors: [AUTHOR.name],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
    },
  };
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = getGuide(slug);

  if (!guide) {
    notFound();
  }

  const { meta, body } = guide;
  const project = relatedProject(meta);
  const projectHref = `/projects/${meta.relatedCourseSlug}/${meta.relatedProjectSlug}`;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-5 pb-24">
      <JsonLd data={guideStructuredData({ meta, author: AUTHOR })} />

      {/* Slim top bar: back + breadcrumb */}
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <Link
          href="/guides"
          aria-label="Back to guides"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Breadcrumb
          items={[
            { label: "Guides", href: "/guides" },
            { label: meta.title },
          ]}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-14">
        <article className="min-w-0">
          <header className="border-b border-border pb-8">
            <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">
              Guide · {meta.level}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-[2.4rem] sm:leading-[1.08]">
              {meta.title}
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {meta.description}
            </p>
            <p className="mt-5 font-mono text-[11px] text-muted-foreground">
              By{" "}
              <Link
                href="/about"
                className="text-foreground underline-offset-4 hover:underline"
              >
                {AUTHOR.name}
              </Link>{" "}
              · {formatDate(meta.datePublished)} · {meta.readingMinutes} min read
            </p>
          </header>

          {/* Mobile build CTA. The rail is desktop-only, so conversion needs a
              hook up top on small screens. */}
          <div className="mt-6 rounded-lg border border-border bg-muted/20 p-5 lg:hidden">
            <h2 className="text-base font-semibold tracking-tight">
              Build it yourself
            </h2>
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
              Build it step by step with the Onlearn tutor checking your work.
            </p>
            <Link
              href={projectHref}
              className="group mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-gradient-to-b from-emerald-500 to-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition-all hover:from-emerald-400 hover:to-emerald-500"
            >
              {project ? `Start: ${project.title}` : "Start the project"}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="pt-8">
            <GuideBody blocks={body} videoUrl={meta.videoUrl} />
          </div>
        </article>

        {/* Sticky rail: build CTA + lecture + author */}
        <aside className="hidden lg:block">
          <div className="flex flex-col gap-6 lg:sticky lg:top-6">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Build it yourself
              </h2>
              <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
                This guide is the companion to a guided project. Build it
                step by step with the Onlearn tutor checking your work.
              </p>
              <Link
                href={projectHref}
                className="group mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-gradient-to-b from-emerald-500 to-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition-all hover:from-emerald-400 hover:to-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {project ? `Start: ${project.title}` : "Start the project"}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <p className="mt-2.5 font-mono text-[11px] text-muted-foreground">
                Free · no signup to start
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <a
                href={meta.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Watch the source lecture ↗
              </a>
            </div>

            <div className="border-t border-border pt-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Written by
              </p>
              <Link
                href="/about"
                className="mt-2 block text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                {AUTHOR.name}
              </Link>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {AUTHOR.role}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
