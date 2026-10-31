import type { ReactNode } from "react";
import { AlertTriangle, Info, Lightbulb, Play } from "lucide-react";
import { GuideQuiz } from "@/components/guide-quiz";
import { renderInline } from "@/lib/inline-md";
import type { GuideBlock } from "@/lib/guide-types";

const calloutStyles = {
  note: { border: "border-border", icon: Info, iconColor: "text-muted-foreground" },
  tip: { border: "border-emerald-500/30", icon: Lightbulb, iconColor: "text-emerald-400" },
  warn: { border: "border-amber-500/30", icon: AlertTriangle, iconColor: "text-amber-400" },
} as const;

function Callout({
  tone = "note",
  title,
  children,
}: {
  tone?: "note" | "tip" | "warn";
  title?: string;
  children: ReactNode;
}) {
  const style = calloutStyles[tone];
  const Icon = style.icon;
  return (
    <div className={`rounded-lg border ${style.border} bg-muted/20 p-5`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${style.iconColor}`} />
        {title ? (
          <p className="text-sm font-semibold text-foreground">{title}</p>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * Renders a guide's block list to server HTML. Only the quiz reveal hydrates on
 * the client.
 */
export function GuideBody({
  blocks,
  videoUrl,
}: {
  blocks: GuideBlock[];
  videoUrl: string;
}) {
  return (
    <div className="flex flex-col gap-7">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "lede":
            return (
              <p
                key={index}
                className="text-lg leading-8 text-muted-foreground"
              >
                {renderInline(block.text)}
              </p>
            );

          case "heading":
            return (
              <h2
                key={index}
                id={block.id}
                className="scroll-mt-20 pt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
              >
                {block.text}
              </h2>
            );

          case "paragraph":
            return (
              <p key={index} className="text-base leading-7 text-foreground">
                {renderInline(block.text)}
              </p>
            );

          case "list":
            return block.ordered ? (
              <ol
                key={index}
                className="flex list-decimal flex-col gap-2 pl-5 text-base leading-7 text-foreground marker:text-muted-foreground"
              >
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ol>
            ) : (
              <ul
                key={index}
                className="flex list-disc flex-col gap-2 pl-5 text-base leading-7 text-foreground marker:text-muted-foreground"
              >
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ul>
            );

          case "code":
            return (
              <figure key={index} className="flex flex-col gap-2">
                <div className="overflow-x-auto rounded-lg border border-border bg-muted/30">
                  <pre className="p-4 text-[13px] leading-6">
                    <code className="font-mono text-foreground">{block.code}</code>
                  </pre>
                </div>
                {block.caption ? (
                  <figcaption className="text-xs text-muted-foreground">
                    {block.caption}
                  </figcaption>
                ) : null}
              </figure>
            );

          case "callout":
            return (
              <Callout key={index} tone={block.tone} title={block.title}>
                {renderInline(block.text)}
              </Callout>
            );

          case "figure":
            return (
              <figure key={index} className="flex flex-col gap-2">
                {block.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={block.src}
                    alt={block.alt}
                    className="w-full rounded-lg border border-border"
                  />
                ) : (
                  <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-8 text-center text-xs text-muted-foreground">
                    {block.caption ?? block.alt}
                  </div>
                )}
                {block.src && block.caption ? (
                  <figcaption className="text-xs text-muted-foreground">
                    {block.caption}
                  </figcaption>
                ) : null}
              </figure>
            );

          case "video":
            return (
              <a
                key={index}
                href={`${videoUrl}?t=${block.seconds}`}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-accent"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-foreground">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
                <span className="min-w-0 flex-1 text-sm text-foreground">
                  <span className="font-medium">Watch:</span> {block.label}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {block.timestamp}
                </span>
              </a>
            );

          case "quiz":
            return (
              <GuideQuiz
                key={index}
                prompt={renderInline(block.prompt)}
                hint={block.hint ? renderInline(block.hint) : undefined}
                answer={renderInline(block.answer)}
              />
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
