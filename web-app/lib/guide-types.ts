/**
 * Content model for long-form guides.
 *
 * A guide is plain data: metadata + an ordered list of blocks. Prose lives in
 * template-literal strings so it stays easy to edit. The server renders blocks
 * to real HTML; the quiz reveal is the only client-side layer.
 *
 * Inline text in `paragraph`, `list`, `callout`, and quiz `answer` supports a
 * tiny markdown subset, rendered by lib/inline-md: **bold**, `code`, and
 * [text](href) links. Nothing else; keep it boring.
 */
export type InlineText = string;

export type GuideBlock =
  // Opening paragraph, rendered larger. One per guide, at the top.
  | { kind: "lede"; text: InlineText }
  // Section heading. `id` becomes the anchor (used for deep links + future TOC).
  | { kind: "heading"; id: string; text: string }
  | { kind: "paragraph"; text: InlineText }
  | { kind: "list"; ordered?: boolean; items: InlineText[] }
  | { kind: "code"; language?: string; code: string; caption?: string }
  | {
      kind: "callout";
      tone?: "note" | "tip" | "warn";
      title?: string;
      text: InlineText;
    }
  // A diagram/image slot. With no `src`, the renderer falls back to text.
  | { kind: "figure"; src?: string; alt: string; caption?: string }
  // A deep link into the source lecture at a specific moment.
  | { kind: "video"; label: string; timestamp: string; seconds: number }
  // An interactive check. The answer is hidden until the reader reveals it.
  | { kind: "quiz"; prompt: InlineText; hint?: InlineText; answer: InlineText };

export type GuideMeta = {
  slug: string;
  /** The on-page <h1> and SEO title base. */
  title: string;
  /** SEO meta description + the dek under the title. ~150-160 chars. */
  description: string;
  /** Informational keywords this guide targets (used for OG/meta, not stuffing). */
  keywords: string[];
  readingMinutes: number;
  /** ISO date, e.g. "2026-06-28". Powers <article> dates + sitemap freshness. */
  datePublished: string;
  dateModified: string;
  /** The project this guide is the companion to (drives the CTA + cross-links). */
  relatedCourseSlug: string;
  relatedProjectSlug: string;
  /** Source lecture. */
  videoId: string;
  videoUrl: string;
  /** e.g. "Beginner-friendly · Python". */
  level: string;
};

export type GuideDoc = {
  meta: GuideMeta;
  body: GuideBlock[];
};
