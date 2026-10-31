import type { Question, Topic, TrackSlug } from "./types";
import type {
  CourseManifest,
  ModuleManifest,
  ProjectManifest,
} from "./project-catalog";
import type { Author } from "./author";
import type { GuideMeta } from "./guide-types";

const DEFAULT_SITE_URL = "https://onlearn.app";

export function siteUrl(): string {
  const raw =
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    DEFAULT_SITE_URL;
  return raw.replace(/\/+$/, "");
}

export function tutorPath(
  track: TrackSlug,
  topicSlug: string,
  questionId?: string,
): string {
  const path = `/${track}/tutor/${topicSlug}`;
  return questionId ? `${path}/${encodeURIComponent(questionId)}` : path;
}

export function absoluteTutorUrl(
  track: TrackSlug,
  topicSlug: string,
  questionId?: string,
): string {
  return `${siteUrl()}${tutorPath(track, topicSlug, questionId)}`;
}

export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function questionDescription(question: Question): string {
  const base = plainText(question.question);
  const suffix = `${question.question_title} practice problem with AI tutor support on Onlearn.`;
  return (base || suffix).slice(0, 155);
}

export function questionKeywords(question: Question): string[] {
  return [
    question.question_topic,
    ...(question.concepts ?? []),
    ...(question.standard_concepts ?? []),
    ...(question.sub_concepts ?? []),
  ]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
}

export function topicForQuestion(topics: Topic[], question: Question): Topic | undefined {
  return topics.find((topic) => topic.question_ids.includes(question.question_id));
}

const ONLEARN_PROVIDER = () => ({
  "@type": "Organization",
  name: "Onlearn",
  url: siteUrl(),
});

const FREE_OFFER = {
  "@type": "Offer",
  price: 0,
  priceCurrency: "USD",
  availability: "https://schema.org/InStock",
};

/**
 * Course + BreadcrumbList (+ VideoObject when the lecture date is known)
 * structured data for a single project page.
 */
export function projectStructuredData(params: {
  course: CourseManifest;
  module: ModuleManifest;
  project: ProjectManifest;
}) {
  const { course, module: moduleItem, project } = params;
  const base = siteUrl();
  const courseUrl = `${base}/projects/${course.slug}`;
  const projectUrl = `${courseUrl}/${project.slug}`;
  const concepts = project.learn?.concepts ?? [];

  const courseNode: Record<string, unknown> = {
    "@type": "Course",
    name: project.title,
    description: project.summary,
    url: projectUrl,
    inLanguage: "en",
    isAccessibleForFree: true,
    provider: ONLEARN_PROVIDER(),
    offers: FREE_OFFER,
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: `PT${project.estimatedMinutes}M`,
    },
  };
  if (concepts.length > 0) {
    courseNode.teaches = concepts;
  }

  const graph: Record<string, unknown>[] = [
    courseNode,
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Projects", item: `${base}/projects` },
        { "@type": "ListItem", position: 2, name: course.title, item: courseUrl },
        { "@type": "ListItem", position: 3, name: project.title, item: projectUrl },
      ],
    },
  ];

  if (moduleItem.videoUploadDate) {
    graph.push({
      "@type": "VideoObject",
      name: moduleItem.title,
      description: moduleItem.description,
      thumbnailUrl: [`https://i.ytimg.com/vi/${moduleItem.videoId}/hqdefault.jpg`],
      uploadDate: moduleItem.videoUploadDate,
      embedUrl: moduleItem.videoUrl,
      contentUrl: moduleItem.videoUrl,
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

/**
 * Course + BreadcrumbList structured data for a project track (course) page.
 * `teaches` aggregates the concepts of the track's live projects.
 */
export function trackStructuredData(params: {
  course: CourseManifest;
  concepts?: string[];
}) {
  const { course, concepts = [] } = params;
  const base = siteUrl();
  const courseUrl = `${base}/projects/${course.slug}`;

  const courseNode: Record<string, unknown> = {
    "@type": "Course",
    name: course.title,
    description: course.description,
    url: courseUrl,
    inLanguage: "en",
    isAccessibleForFree: true,
    provider: ONLEARN_PROVIDER(),
    offers: FREE_OFFER,
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
    },
  };
  if (concepts.length > 0) {
    courseNode.teaches = concepts;
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      courseNode,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Projects", item: `${base}/projects` },
          { "@type": "ListItem", position: 2, name: course.title, item: courseUrl },
        ],
      },
    ],
  };
}

/** A schema.org Person built from our single author identity. */
export function authorPerson(author: Author) {
  const node: Record<string, unknown> = {
    "@type": "Person",
    name: author.name,
    url: `${siteUrl()}${author.url}`,
    description: author.bio.join(" "),
  };
  if (author.avatarSrc) {
    node.image = `${siteUrl()}${author.avatarSrc}`;
  }
  const sameAs = author.links.map((link) => link.href);
  if (sameAs.length > 0) {
    node.sameAs = sameAs;
  }
  return node;
}

/** Standalone Person structured data for the /about page. */
export function personStructuredData(author: Author) {
  return { "@context": "https://schema.org", ...authorPerson(author) };
}

/**
 * TechArticle + BreadcrumbList structured data for a guide. Cites the source
 * lecture via `isBasedOn` and ties authorship to the shared author record.
 */
export function guideStructuredData(params: {
  meta: GuideMeta;
  author: Author;
}) {
  const { meta, author } = params;
  const base = siteUrl();
  const guideUrl = `${base}/guides/${meta.slug}`;

  const articleNode: Record<string, unknown> = {
    "@type": "TechArticle",
    headline: meta.title,
    description: meta.description,
    url: guideUrl,
    mainEntityOfPage: guideUrl,
    inLanguage: "en",
    isAccessibleForFree: true,
    datePublished: meta.datePublished,
    dateModified: meta.dateModified,
    keywords: meta.keywords,
    author: authorPerson(author),
    publisher: ONLEARN_PROVIDER(),
    isBasedOn: meta.videoUrl,
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      articleNode,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Guides", item: `${base}/guides` },
          { "@type": "ListItem", position: 2, name: meta.title, item: guideUrl },
        ],
      },
    ],
  };
}
