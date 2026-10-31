/**
 * Single source of truth for author identity.
 *
 * This powers the guide byline, the JSON-LD `author` (Person) on every guide,
 * and the /about page.
 */
export type AuthorLink = {
  label: string;
  href: string;
};

export type Author = {
  /** Display name shown on bylines and in Person structured data. */
  name: string;
  /** One-line credential, e.g. "CS @ IIT Roorkee · building Onlearn". */
  role: string;
  /** A few honest sentences. Shown on /about and in Person.description. */
  bio: string[];
  /** Canonical author page. */
  url: string;
  /** Optional headshot in /public, e.g. "/author.jpg". */
  avatarSrc?: string;
  /** Profile links used on /about and as Person.sameAs for SEO. */
  links: AuthorLink[];
};

export const AUTHOR: Author = {
  name: "Ashish Bhardwaj",
  role: "Building Onlearn",
  bio: [
    "I build Onlearn to make hard technical subjects feel less passive: read the idea, build the project, and get feedback while you work.",
    "These guides are working notes from building the projects myself. I keep the explanations close to the code, because that is where most of the understanding happens.",
  ],
  url: "/about",
  links: [
    { label: "GitHub", href: "https://github.com/ash25082003" },
  ],
};
