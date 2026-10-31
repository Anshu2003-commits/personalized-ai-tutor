# SEO: Projects & Guides

How search/SEO works for the `/projects` flow and the `/guides` content layer,
what is wired today, and what to take care of as the catalog scales. Most of it
is **data-driven**: add a project to a `module.json` (or a guide to
`content/guides/`) and the sitemap, structured data, OG image, and on-page
content all populate automatically.

The two flows support each other: **guides** answer informational searches such
as "how backpropagation works", and **projects** give readers a place to build.
They cross-link both ways (see §5, §7).

> Scope note: this covers the **`/projects/*`** and **`/guides/*`** routes (plus
> `/about`). The DSA/DS tutor pages and the homepage are out of scope here (see
> "Future work").

---

## 1. Sitemap: `app/sitemap.ts`

Catalog-driven. Emits, in addition to the homepage / tracks / tutor questions:

- `/projects` (index)
- `/projects/{course}` for every course
- `/projects/{course}/{project}` for every **live** project, each with the
  module's YouTube thumbnail as an `image` entry and a `video` entry
  (title / thumbnail / description / `player_loc`).

Plus the guides layer:

- `/guides` (index) and `/about`
- `/guides/{slug}` for every guide

Project `lastModified` uses **real file mtimes** (`getCourseModified` /
`getModuleModified` in `lib/project-catalog.ts`), not `new Date()`, which is a more stable
signal. Guides are code, not catalog files, so their `lastModified` comes from the
`dateModified` string in `content/guides/{slug}.ts`; keep it current when you edit
a guide.

⚠️ **Gotcha:** this Next version does **not** XML-escape the `images`/`videos`
extension fields. Any free text put there must go through the `xmlText()` helper
in `app/sitemap.ts` (it escapes `& < > " '`). Standard fields like `<loc>` are
escaped by Next automatically; do not double-escape those.

## 2. Per-project content layer ("What you'll learn")

Each project in `module.json` can carry a `learn` block (typed `ProjectLearn` in
`lib/project-catalog.ts`):

```jsonc
"learn": {
  "outcomes": ["...", "..."],        // check-bullet list, high level
  "concepts": ["Backpropagation", "Chain rule", "..."],  // chips + JSON-LD teaches
  "prerequisites": "One sentence."
}
```

Rendered as a "What you'll learn" section on the project page (between the payoff
and the tutor demo). This is the **anti-thin-content layer**: unique, keyword-rich
text per project so pages can rank at scale.

⚠️ Keep `outcomes`/`concepts` **high level**. Never reproduce the step-by-step
milestone list. The repos deliberately reveal milestones one at a time
(`CURRICULUM.md`), and spoiling them on the public page would undercut the tutor.

## 3. Structured data (JSON-LD)

- Component: `components/json-ld.tsx` (escapes `<` per Next guidance).
- Builders in `lib/seo.ts`: `projectStructuredData` / `trackStructuredData`
  (projects) and `guideStructuredData` / `personStructuredData` (guides + about).
  `authorPerson` builds the shared `Person` node from `lib/author.ts` so the guide
  author and the `/about` page never drift.

Emitted:

| Page    | Schema types |
| ------- | ------------ |
| Track   | `Course` (teaches = aggregated project concepts, `hasCourseInstance`, free `Offer`) + `BreadcrumbList` |
| Project | `Course` (teaches, `courseWorkload = PT{minutes}M`, free `Offer`) + `BreadcrumbList` + `VideoObject` |
| Guide   | `TechArticle` (author `Person`, `isBasedOn` = source lecture URL, `keywords`, `datePublished` / `dateModified`, free) + `BreadcrumbList` |
| About   | `Person` (name, `description` from bio, `sameAs` = profile links) |

`VideoObject` only renders when the module has a `videoUploadDate` (ISO date) in
`module.json`. Google needs an upload date for video rich-result eligibility.
The micrograd module is set to `2022-08-16` (Karpathy's lecture); **confirm this**
and set a real date for every new module or the `VideoObject` is silently skipped.

Validate after deploy with the [Rich Results Test](https://search.google.com/test/rich-results).

## 4. OpenGraph / Twitter + dynamic share images

- **Metadata:** `openGraph` + `twitter` (`summary_large_image`) + `alternates.canonical`
  + `robots` on the index, track, and project pages. `metadataBase` is set in
  `app/layout.tsx`, so relative `url`/`canonical` paths resolve to absolute.
- **Images:** generated per route via `opengraph-image.tsx`
  (`app/projects/`, `app/projects/[courseSlug]/`, `.../[projectSlug]/`, and
  `app/guides/[slug]/`), sharing `components/og-card.tsx`. 1200×630, monochrome
  Linear style with the emerald brand dot. Guides pass eyebrow `"Guide"` + level +
  reading time. The `og:image` tag is injected automatically by the file convention.

⚠️ **`og-card.tsx` is Satori, not React DOM:** only flexbox + inline styles, every
multi-child container needs `display: flex`. Fonts are omitted on purpose;
`next/og` ships **Geist Regular** as its default (only weight bundled; there is no
bold, so hierarchy is by size/color). To get bold titles, ship a Geist bold `.ttf`
and load it via `readFile` + the `fonts` option.

## 5. Internal linking, breadcrumbs, titles

- **Visible breadcrumb:** `components/breadcrumb.tsx`, `Projects › Track › Project`,
  matching the `BreadcrumbList` JSON-LD. The left-rail back-arrow was kept.
- **"Next project" card** at the bottom of the project reading column (falls back to
  "see the full roadmap" on the last project). This keeps users moving and spreads crawl
  equity.
- **Intent-tuned `<title>`s** on index/track/project (e.g. "Build the autograd engine
  with a guided Python project and an AI tutor"). On-page H1 stays clean.
- **Topic cluster (guides ↔ projects):** every guide links to its companion project
  (emerald CTA in the desktop rail + a mobile card) and each project page links back
  to its guide ("Prefer to read first?"). Guides also cross-link to each other and
  out to the source lecture at exact timestamps. A **Guides** entry was added to the
  global nav (`components/nav-header.tsx`). This keeps related pages connected
  instead of leaving each guide or project isolated.

## 6. Off-page: repo backlinks

Each project repo README ends with a "More from Onlearn → Explore more courses"
footer linking to `https://onlearn.app/projects` (and the track page); the autograd
README also links "Next up" to Project 2's page. Drives crawl + a relevant backlink
+ funnels repo visitors back into the site.

## 7. Guides: content layer

The `/guides/*` routes are long-form companion notes for project topics. They
should answer "how X works" searches clearly, then point readers to the matching
project when they are ready to build.

How a guide is built (all data, no per-page code):

- Content lives in `content/guides/{slug}.ts` as a `GuideDoc`: metadata + an
  ordered list of typed blocks (`lib/guide-types.ts`). Prose is plain
  template-literal strings; a tiny inline-markdown renderer (`lib/inline-md.tsx`)
  handles `**bold**`, `*italic*`, `` `code` ``, and `[text](href)` (internal links
  auto-use the router).
- `lib/guides.ts` is the registry; `app/guides/[slug]/page.tsx` statically generates
  each guide (`generateStaticParams`) and `/guides` lists them.
- Blocks render to **server HTML** via `components/guide-body.tsx`, so the guide
  text is present in the page source. The only client piece is the quiz reveal
  (`components/guide-quiz.tsx`).

Quality bar:

1. Use first-hand project notes: what was confusing, what fixed it, and what to
   test.
2. Keep the author record real (§8): name, short role, bio, and profile links.
3. Cite the source lecture with `isBasedOn` and timestamped outbound links.
4. Cross-link the guide and project in both directions (§5).

A guide should be original synthesis, not a transcript of the video. Avoid padded
sections. Add figures only when there is a real image asset in `/public`; do not
ship empty figure blocks.

## 8. Author identity: `lib/author.ts`

One file is the single source of truth for the author, reused by the guide byline,
the guide JSON-LD `author`, the `/about` page, and `Person.sameAs`. Edit it once and
all four stay in sync (`authorPerson` in `lib/seo.ts` builds the shared node).

Facts must be accurate. Verify the name, one-line role, short bio, and profile
URLs before shipping. More real `sameAs` links help; today only GitHub is set.
Optionally add a headshot in `/public` and set `avatarSrc`.

---

## Adding a new guide (checklist)

1. Create `content/guides/{slug}.ts` exporting a `GuideDoc`. Set `relatedCourseSlug`
   / `relatedProjectSlug` to wire the project ↔ guide cross-links.
2. Register it in `lib/guides.ts` (array order = reading order on `/guides`).
3. Write original synthesis, not a transcript. Add `video` blocks at real
   timestamps. Add `figure` blocks only when the image asset exists.
4. Confirm `datePublished` / `dateModified`, `keywords`, and `level`.

Sitemap, JSON-LD, OG image, breadcrumb, byline, nav, and the project ↔ guide links
all populate with no page-code changes.

---

## Adding a new project (checklist)

Everything keys off `module.json`. For a new project, set:

1. `order`, `slug`, `title`, `summary`, `language`, `estimatedMinutes`, `repoUrl`
2. `learn` block (`outcomes`, `concepts`, `prerequisites`), **required for non-thin
   pages**; concepts also feed JSON-LD `teaches`
3. On the module: `videoUploadDate` (ISO) so the `VideoObject` emits
4. Add the "More from Onlearn" footer to the new repo's README

Then sitemap, JSON-LD, OG image, breadcrumb, next-project link, and the content
layer all populate with no page-code changes.

---

## Future work / take care of

**Already done:**
- [x] **Deployed** to `https://onlearn.app/projects`.
- [x] Production env uses `SITE_URL=https://onlearn.app` and
      `NEXT_PUBLIC_SITE_URL=https://onlearn.app`.
- [x] Staging env uses `https://staging.onlearn.app`.
- [x] **Guides + author layer** (`/guides/*`, `/about`): data-driven content model,
      server-rendered prose, `TechArticle` + `Person` JSON-LD, OG images, sitemap,
      nav entry, and the bidirectional guide ↔ project topic cluster (§7-8).

**Blocking before this ranks (action items):**
- [ ] **Push the README backlinks** (commits were prepared in scratch clones) and
      **mark the source repos as templates** (`gh repo edit … --template`) so the
      "Use this template" CTA works.
- [ ] Add guide diagrams when the assets are ready; do not ship empty `figure`
      blocks.
- [ ] Verify `lib/author.ts` is real and final: name, role, bio, and links.
- [ ] **Google Search Console:** submit the sitemap; watch *indexed vs. published*
      and "crawled, currently not indexed" (the thin-content canary). Covers guides
      too now.

**Quality / scaling:**
- [ ] Re-validate structured data + OG cards with the Rich Results Test and a social
      debugger after deploy changes (now includes `TechArticle` + `Person`).
- [ ] As projects scale, keep `learn` blocks specific and useful; thin templated
      pages are the main programmatic-SEO risk.
- [ ] Keep guides **original synthesis, not transcripts**; bump `dateModified` on edit.
- [ ] Per-module `videoUploadDate` must be real for each new module.
- [ ] Promote useful guides for backlinks; share in relevant places after the guide
      has real examples and diagrams.

**Expansion (not yet built):**
- [ ] **Concept pages** (`/concepts/backpropagation`, …) explaining a term and linking
      to the project/guide that teaches it. Guides now cover some informational intent,
      but dedicated concept pages still capture term-level queries.
- [ ] **FAQ blocks + `FAQPage` JSON-LD** on guides/projects to catch "how does X"
      queries and earns rich results.
- [ ] Extend JSON-LD + dynamic OG images to the **rest of the site** (tutor pages have
      OG metadata but no JSON-LD; homepage has neither).
- [ ] `Organization` / `WebSite` JSON-LD + sitelinks search box on the homepage.
- [ ] Geist **bold** for OG titles (only Regular is bundled today).
