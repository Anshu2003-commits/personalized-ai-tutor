/**
 * Shared layout for generated OpenGraph/Twitter images (1200x630).
 *
 * This is NOT a normal React component - it is rendered by Satori via
 * `next/og`'s ImageResponse, which only supports flexbox layout and inline
 * styles. Every container with more than one child sets `display: flex`.
 * Fonts are intentionally omitted: next/og ships Geist Regular as its default.
 */
type OgCardProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  footer: string;
};

export function OgCard({ eyebrow, title, subtitle, footer }: OgCardProps) {
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#0a0a0a",
        color: "#fafafa",
        padding: "72px",
      }}
    >
      <div
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              width: 14,
              height: 14,
              borderRadius: 9999,
              backgroundColor: "#34d399",
              marginRight: 14,
            }}
          />
          <div style={{ display: "flex", fontSize: 30, letterSpacing: "-0.02em" }}>
            Onlearn
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: "#a1a1aa",
            letterSpacing: "0.18em",
          }}
        >
          {eyebrow.toUpperCase()}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            maxWidth: 1010,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 32,
              color: "#a1a1aa",
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 1,
            backgroundColor: "rgba(255,255,255,0.12)",
            marginBottom: 28,
          }}
        />
        <div style={{ display: "flex", fontSize: 24, color: "#a1a1aa" }}>
          {footer}
        </div>
      </div>
    </div>
  );
}
