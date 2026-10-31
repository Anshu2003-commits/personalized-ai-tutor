import { ImageResponse } from "next/og";
import { OgCard } from "@/components/og-card";
import { getCourseModules, getProjectCourse } from "@/lib/project-catalog";

export const alt = "Onlearn - a guided project with an AI tutor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ courseSlug: string; projectSlug: string }>;
}) {
  const { courseSlug, projectSlug } = await params;

  let title = "Build real projects";
  let subtitle = "Onlearn";
  let footer = "AI-tutored project";

  try {
    const course = getProjectCourse(courseSlug);
    subtitle = course.title;
    for (const moduleItem of getCourseModules(courseSlug)) {
      const project = moduleItem.projects.find(
        (item) => item.slug === projectSlug,
      );
      if (project) {
        title = project.title;
        const language =
          project.language.charAt(0).toUpperCase() + project.language.slice(1);
        footer = `${language}  ·  ~${project.estimatedMinutes} min  ·  AI-tutored`;
        break;
      }
    }
  } catch {
    // fall back to the generic defaults above
  }

  return new ImageResponse(
    (
      <OgCard
        eyebrow="Guided project"
        title={title}
        subtitle={subtitle}
        footer={footer}
      />
    ),
    { ...size },
  );
}
