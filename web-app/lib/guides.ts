import { buildAnAutogradEngine } from "@/content/guides/build-an-autograd-engine";
import { trainANeuralNet } from "@/content/guides/train-a-neural-net";
import type { GuideDoc } from "@/lib/guide-types";

/**
 * Ordered registry of guides. Order here is the intended reading order (it
 * drives the /guides index), so keep prerequisites before what builds on them.
 */
const GUIDES: GuideDoc[] = [buildAnAutogradEngine, trainANeuralNet];

export function getGuides(): GuideDoc[] {
  return GUIDES;
}

export function getGuide(slug: string): GuideDoc | undefined {
  return GUIDES.find((guide) => guide.meta.slug === slug);
}

export function getGuideSlugs(): string[] {
  return GUIDES.map((guide) => guide.meta.slug);
}

/** The companion guide for a project, if one exists (reverse of the CTA link). */
export function getGuideForProject(
  courseSlug: string,
  projectSlug: string,
): GuideDoc | undefined {
  return GUIDES.find(
    (guide) =>
      guide.meta.relatedCourseSlug === courseSlug &&
      guide.meta.relatedProjectSlug === projectSlug,
  );
}

/** All guides whose companion project lives in this course, in reading order. */
export function getGuidesForCourse(courseSlug: string): GuideDoc[] {
  return GUIDES.filter((guide) => guide.meta.relatedCourseSlug === courseSlug);
}
