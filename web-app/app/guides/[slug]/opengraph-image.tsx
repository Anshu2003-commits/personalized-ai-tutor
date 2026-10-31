import { ImageResponse } from "next/og";
import { OgCard } from "@/components/og-card";
import { getGuide } from "@/lib/guides";

export const alt = "Onlearn guide";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);

  const title = guide?.meta.title ?? "Onlearn guide";
  const footer = guide
    ? `${guide.meta.level}  ·  ${guide.meta.readingMinutes} min read`
    : "A hands-on guide";

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Guide"
        title={title}
        subtitle="Onlearn"
        footer={footer}
      />
    ),
    { ...size },
  );
}
