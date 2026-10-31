import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A deliberately tiny inline-markdown renderer for guide prose. Supports only:
 *   **bold**, *italic*, `code`, and [text](href).
 * It builds React nodes directly (never dangerouslySetInnerHTML), so content is
 * safe by construction. Internal links (`/...`) use next/link; external links
 * open in a new tab. Patterns don't nest; keep prose flat.
 */
const TOKEN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

const linkClass =
  "font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground";

export function renderInline(text: string): ReactNode[] {
  return text
    .split(TOKEN)
    .map((part, index) => {
      if (!part) return null;

      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={index} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }

      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={index}>{part.slice(1, -1)}</em>;
      }

      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={index}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      const link = LINK.exec(part);
      if (link) {
        const [, label, href] = link;
        if (href.startsWith("/")) {
          return (
            <Link key={index} href={href} className={linkClass}>
              {label}
            </Link>
          );
        }
        return (
          <a
            key={index}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            {label}
          </a>
        );
      }

      return <span key={index}>{part}</span>;
    })
    .filter(Boolean);
}
