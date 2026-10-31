import type { MetadataRoute } from "next";
import { getAllQuestionsFlat, getTopicsByTrack } from "@/lib/catalog";
import {
  getCourseModified,
  getCourseModules,
  getModuleModified,
  getProjectCourses,
} from "@/lib/project-catalog";
import { absoluteTutorUrl, siteUrl, topicForQuestion } from "@/lib/seo";
import { getGuides } from "@/lib/guides";
import { TRACKS } from "@/lib/types";

// This Next version does not XML-escape the sitemap `videos`/`images`
// extension fields (only the standard ones), so escape free text ourselves.
function xmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl(),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...TRACKS.map((track) => ({
      url: `${siteUrl()}/${track.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    {
      url: `${siteUrl()}/guides`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl()}/about`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];

  const guideRoutes: MetadataRoute.Sitemap = getGuides().map((guide) => ({
    url: `${siteUrl()}/guides/${guide.meta.slug}`,
    lastModified: new Date(`${guide.meta.dateModified}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const questionRoutes = getAllQuestionsFlat()
    .filter((question) => question.question_id !== "intro")
    .flatMap((question) => {
      const topic = topicForQuestion(getTopicsByTrack(question.track), question);
      if (!topic) return [];
      return {
        url: absoluteTutorUrl(question.track, topic.slug, question.question_id),
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: question.has_code ? 0.9 : 0.75,
      };
    });

  const projectRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl()}/projects`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  for (const { course } of getProjectCourses()) {
    projectRoutes.push({
      url: `${siteUrl()}/projects/${course.slug}`,
      lastModified: getCourseModified(course.slug),
      changeFrequency: "weekly",
      priority: 0.8,
    });

    for (const moduleItem of getCourseModules(course.slug)) {
      const thumbnailUrl = `https://i.ytimg.com/vi/${moduleItem.videoId}/hqdefault.jpg`;

      for (const project of moduleItem.projects) {
        projectRoutes.push({
          url: `${siteUrl()}/projects/${course.slug}/${project.slug}`,
          lastModified: getModuleModified(course.slug, moduleItem.slug),
          changeFrequency: "monthly",
          priority: 0.9,
          images: [thumbnailUrl],
          videos: [
            {
              title: xmlText(project.title),
              thumbnail_loc: thumbnailUrl,
              description: xmlText(project.summary),
              player_loc: moduleItem.videoUrl,
            },
          ],
        });
      }
    }
  }

  return [...staticRoutes, ...questionRoutes, ...projectRoutes, ...guideRoutes];
}
