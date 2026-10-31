# SEO Improvements Log

## Implemented now (actual shipped changes)

### 1) Route-level dynamic metadata for tutor pages
`generateMetadata` was added on both tutor routes so each page can render problem-specific metadata from server data.

Status: ✅ Done

Files:
- [web-app/app/dsa/tutor/[slug]/page.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/dsa/tutor/[slug]/page.tsx)
- [web-app/app/ds/tutor/[slug]/page.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/ds/tutor/[slug]/page.tsx)

What changed:
- Added `generateMetadata` that builds `title`, `description`, `keywords`, `alternates.canonical`, and `openGraph` for each request.
- Metadata is tied to the selected question (when `q` is valid), otherwise topic fallback.
- Added `initialQuestionId` prop so the UI starts at the same question the server used for metadata.

Why this helps:
- Search engines get crawl-relevant metadata before JS hydration.
- Title/description become unique per problem, improving SERP presentation.
- Canonical URL is explicit, reducing duplicate/ambiguous indexability.

### 2) Shared SEO/site metadata foundation
Root metadata was centralized around a shared site URL helper.

Status: ✅ Done

Files:
- [web-app/app/layout.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/layout.tsx)
- [web-app/lib/seo.ts](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/lib/seo.ts)

What changed:
- Added `metadataBase: new URL(siteUrl())` in app layout.
- Set default `alternates` and `robots` values at root metadata level.
- Added `siteUrl()` fallback logic (`SITE_URL` / `NEXT_PUBLIC_SITE_URL` / `https://onlearn.app`).

Why this helps:
- Avoids URL resolution inconsistencies.
- Gives crawler-facing defaults for non-overridden pages.

### 3) Server-side `q` validation and safe fallback
The selected question is now determined on server, then passed to client as initial state.

Status: ✅ Done

Files:
- [web-app/app/dsa/tutor/[slug]/page.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/dsa/tutor/[slug]/page.tsx)
- [web-app/app/ds/tutor/[slug]/page.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/ds/tutor/[slug]/page.tsx)

What changed:
- Added a `selectedQuestionId()` helper.
- It validates `searchParams.q` against `topic.question_ids`.
- Invalid or missing IDs fall back to the first question in the topic.

Why this helps:
- Prevents accidental duplicate/noisy URLs from invalid IDs.
- Keeps canonicalized server and client state consistent.
- Improves crawl hygiene for query-driven URLs.

### 4) Server-rendered problem summary + JSON-LD
A hidden-but-rendered SEO summary section is injected into tutor pages.

Status: ✅ Done

Files:
- [web-app/components/tutor-seo-summary.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/components/tutor-seo-summary.tsx)
- [web-app/app/dsa/tutor/[slug]/page.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/dsa/tutor/[slug]/page.tsx)
- [web-app/app/ds/tutor/[slug]/page.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/ds/tutor/[slug]/page.tsx)
- [web-app/lib/seo.ts](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/lib/seo.ts)

What changed:
- New `TutorSeoSummary` component renders `sr-only` content for crawlers.
- Includes title, topic, difficulty, keyword list, cleaned markdown text and JSON-LD (`LearningResource`).

Why this helps:
- Pages carry discoverable textual context even if bots do limited JS rendering.
- JSON-LD provides structured meaning for learning content.

### 5) Auto-generated sitemap (`/sitemap.xml`)
Sitemap now includes all public route surfaces in a deterministic build.

Status: ✅ Done

Files:
- [web-app/app/sitemap.ts](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/sitemap.ts)
- [web-app/lib/catalog.ts](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/lib/catalog.ts)
- [web-app/lib/seo.ts](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/lib/seo.ts)

What changed:
- Added static sitemap route with home/track/question URLs.
- Added `getAllQuestionsFlat()` in catalog.
- Reused topic lookup + absolute URL helpers to keep links consistent.
- Excluded onboarding placeholder question (`question_id === "intro").
- Question entries now use clean path URLs instead of `?q=` parameters.

Why this helps:
- Gives search engines a clear crawl list.
- Improves coverage of long-tail question URLs that may not be linked deeply yet.

### 6) Robots directive file (`/robots.txt`)
Added explicit crawl policy at app route level.

Status: ✅ Done

Files:
- [web-app/app/robots.ts](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/robots.ts)

What changed:
- Allow crawling on public paths.
- Block `/api/`, `/me`, `/onboarding`, `/upgrade/success`.
- Point sitemap pointer to `/sitemap.xml`.

Why this helps:
- Search budget is not wasted on endpoint routes.
- Cleaner crawl graph and fewer crawl errors.

### 7) Shared SEO utility module
Reusable SEO helpers now live in one module and are used by both tracks.

Status: ✅ Done

Files:
- [web-app/lib/seo.ts](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/lib/seo.ts)
- [web-app/lib/catalog.ts](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/lib/catalog.ts)

What changed:
- Added `siteUrl`, `absoluteTutorUrl`, `tutorPath`, `plainText`, `questionDescription`, `questionKeywords`, `topicForQuestion`.

Why this helps:
- Keeps DS + DSA implementations aligned.
- Easier to extend metadata logic later without divergence.

### 8) SEO documentation and rollout tracking
A dedicated tracking file was added and kept updated.

Status: ✅ Done

File:
- [web-app/SEO_IMPROVEMENTS.md](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/SEO_IMPROVEMENTS.md)

What changed:
- Logged all shipped SEO updates with intent and why they matter.
- Added a backlog section for deferred improvements.

### 9) Clean problem URLs
Problem pages now use path-based URLs instead of query parameters.

Status: ✅ Done

Files:
- [web-app/lib/seo.ts](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/lib/seo.ts)
- [web-app/components/tutor-page-shell.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/components/tutor-page-shell.tsx)
- [web-app/app/dsa/tutor/[slug]/[questionId]/page.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/dsa/tutor/[slug]/[questionId]/page.tsx)
- [web-app/app/ds/tutor/[slug]/[questionId]/page.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/ds/tutor/[slug]/[questionId]/page.tsx)
- [web-app/app/dsa/tutor/[slug]/page.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/dsa/tutor/[slug]/page.tsx)
- [web-app/app/ds/tutor/[slug]/page.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/ds/tutor/[slug]/page.tsx)
- [web-app/components/track-roadmap.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/components/track-roadmap.tsx)
- [web-app/components/tutor-view.tsx](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/components/tutor-view.tsx)
- [web-app/app/sitemap.ts](/home/ashish-bhardwaj/Projects/onlearn-monorepo/web-app/app/sitemap.ts)

What changed:
- Clean question URLs now look like `/dsa/tutor/<topic-slug>/<question-id>`.
- Old topic/query URLs redirect permanently to the clean path.
- Roadmap links, resume/start links, metadata canonicals, JSON-LD URLs, and sitemap entries all use the clean path.
- In-tutor previous/next/question-list navigation updates the browser URL without reloading the tutor workspace.

Why this helps:
- Problem URLs are easier to share and understand.
- Search engines get one canonical URL per question.
- The sitemap no longer asks crawlers to index query-param question URLs.

## Implemented outcome summary
- Tutor pages now carry metadata and indexed text on the server response path.
- Crawl discovery now exists through `sitemap.xml` + `robots.txt`.
- JSON-LD and keyword extraction are in place for machine readability.
- Metadata behavior is consistent for `/dsa/...` and `/ds/...` pages.
- Problem pages now use clean path URLs, with old query URLs redirected.

## Keep for later (high-priority)

### 10) Public read-only problem route
- Add non-auth pages that show problem text only.
- Keep full tutor experience behind current app flow.
- Benefit: better long-term crawlability and low-friction sharing.

### 11) OG image generation
- Add per-question/track social cards.
- Benefit: improved social previews and click-through quality.

### 12) Internal link expansion
- Make roadmap/topic pages link to every question URL.
- Benefit: stronger internal discovery and authority flow.

### 13) Search console + monitoring
- Submit `/sitemap.xml`, monitor indexing and errors.
- Benefit: prevent silent SEO regressions after deployment.
