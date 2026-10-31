import { ImageResponse } from "next/og";
import { OgCard } from "@/components/og-card";

export const alt = "Onlearn - build real projects with an AI tutor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <OgCard
        eyebrow="Projects"
        title="Build real projects with an AI tutor"
        subtitle="Guided, hands-on coding projects"
        footer="Free to start  ·  you keep the code"
      />
    ),
    { ...size },
  );
}
