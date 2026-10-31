import Image from "next/image";
import { cn } from "@/lib/utils";

type ScreenshotProps = {
  /** Path under /public, e.g. "/landing/hero.png". Omit to render an empty,
   *  labeled placeholder slot (so the page never 404s before assets land). */
  src?: string;
  alt: string;
  /** Intrinsic pixel size of the asset (next/image needs both). */
  width: number;
  height: number;
  /** CSS aspect-ratio for the placeholder box, e.g. "16 / 10". */
  ratio?: string;
  /** Fake browser chrome (traffic-light dots) around the shot. */
  chrome?: boolean;
  className?: string;
};

/**
 * Framed product screenshot with a graceful placeholder.
 *
 * Pass `src` once the asset exists in /public/landing. Until then it renders a
 * dashed slot labeled with the alt text + ratio so it's obvious what goes where.
 */
export default function Screenshot({
  src,
  alt,
  width,
  height,
  ratio = "16 / 10",
  chrome = true,
  className,
}: ScreenshotProps) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background shadow-sm",
        className,
      )}
    >
      {chrome && (
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
        </div>
      )}

      {src ? (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="h-auto w-full"
        />
      ) : (
        <div
          className="flex w-full items-center justify-center border border-dashed border-border/60 bg-muted/10"
          style={{ aspectRatio: ratio }}
        >
          <span className="px-4 text-center font-mono text-[11px] text-muted-foreground">
            {alt} · {ratio.replace(/\s/g, "")}
          </span>
        </div>
      )}
    </figure>
  );
}
