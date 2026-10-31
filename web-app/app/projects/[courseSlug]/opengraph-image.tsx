import { ImageResponse } from "next/og";
import { OgCard } from "@/components/og-card";
import { getProjectCourse } from "@/lib/project-catalog";

export const alt = "Onlearn - guided projects with an AI tutor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;

  let title = "Guided projects";
  let subtitle = "Onlearn";

  try {
    const course = getProjectCourse(courseSlug);
    title = course.title;
    subtitle = `${course.author}  ·  build it from scratch`;
  } catch {
    // fall back to the generic defaults above
  }

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Project track"
        title={title}
        subtitle={subtitle}
        footer="Free to start  ·  you keep the code"
      />
    ),
    { ...size },
  );
}
