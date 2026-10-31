"use client";

import "katex/dist/katex.min.css";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

// LLMs and some statements write math with LaTeX delimiters (\( \), \[ \])
// rather than the dollar delimiters remark-math understands. Normalize them
// to `$`/`$$`, skipping fenced and inline code so code samples are untouched.
function normalizeMath(src: string): string {
  const blocks = src.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
  return blocks
    .map((block, i) => (i % 2 === 1 ? block : convertOutsideInlineCode(block)))
    .join("");
}

function convertOutsideInlineCode(text: string): string {
  return text
    .split(/(`[^`\n]*`)/g)
    .map((part, i) => (i % 2 === 1 ? part : convertDelimiters(part)))
    .join("");
}

function convertDelimiters(text: string): string {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, body) => `$$${body.trim()}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, body) => `$${body.trim()}$`);
}

// Catalog question statements and solution explanations are markdown
// (headings, inline code, fenced blocks, lists, tables, math). Rendered with a
// component map instead of typography plugins so it matches the pane chrome.
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[14px] leading-7 text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => <Heading>{children}</Heading>,
          h2: ({ children }) => <Heading>{children}</Heading>,
          h3: ({ children }) => <Heading>{children}</Heading>,
          h4: ({ children }) => <Heading>{children}</Heading>,
          p: ({ children }) => <p className="mt-3 first:mt-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mt-3 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-3 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-6">{children}</li>,
          code: ({ children, className }) =>
            className?.includes("language-") ? (
              <code className="font-mono text-[12.5px]">{children}</code>
            ) : (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-background px-3 py-2.5 font-mono text-[12.5px] leading-relaxed">
              {children}
            </pre>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mt-3 border-l-2 border-border pl-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted/40 px-3 py-1.5 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-1.5">{children}</td>
          ),
          hr: () => <hr className="my-4 border-border" />,
        }}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-5 text-[15px] font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h3>
  );
}
