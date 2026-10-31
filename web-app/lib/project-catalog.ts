import fs from "node:fs";
import path from "node:path";

export type ProjectLearn = {
  outcomes: string[];
  concepts: string[];
  prerequisites: string;
};

/**
 * The per-project "pitch" content the detail page sells with. Lives in the
 * catalog (not the page) so every project renders its own copy. Kept lean - a
 * payoff line, a short "what you'll build" paragraph, and one honest sentence on
 * how the tutor works. No fabricated transcripts or decorative snippets.
 */
export type ProjectPitch = {
  /** A short "what you'll build" lead paragraph. */
  body: string;
  /** One honest sentence on how the tutor works. */
  tutorIntro: string;
};

export type ProjectManifest = {
  order: number;
  slug: string;
  title: string;
  summary: string;
  language: string;
  estimatedMinutes: number;
  repoUrl?: string;
  learn?: ProjectLearn;
  pitch?: ProjectPitch;
};

export type CourseModuleManifest = {
  order: number;
  slug: string;
  title: string;
  videoId: string;
  videoUrl: string;
  hasContent: boolean;
};

export type CourseManifest = {
  slug: string;
  title: string;
  author: string;
  source: string;
  description: string;
  modules: CourseModuleManifest[];
};

export type ModuleManifest = {
  slug: string;
  courseSlug: string;
  order: number;
  title: string;
  videoId: string;
  videoUrl: string;
  videoUploadDate?: string;
  description: string;
  projects: ProjectManifest[];
};

export type ProjectCourseSummary = {
  course: CourseManifest;
  liveModules: CourseModuleManifest[];
  firstLiveModule?: ModuleManifest;
  projectCount: number;
};

const PROJECTS_ROOT = path.resolve(process.cwd(), "..", "projects");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function getCourseRoot(courseSlug: string): string {
  return path.join(PROJECTS_ROOT, courseSlug);
}

function getModuleRoot(courseSlug: string, moduleSlug: string): string {
  return path.join(getCourseRoot(courseSlug), moduleSlug);
}

export function getProjectCourses(): ProjectCourseSummary[] {
  if (!fs.existsSync(PROJECTS_ROOT)) {
    return [];
  }

  return fs
    .readdirSync(PROJECTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((courseSlug) =>
      fs.existsSync(path.join(getCourseRoot(courseSlug), "course.json")),
    )
    .map((courseSlug) => {
      const course = getProjectCourse(courseSlug);
      const liveModules = course.modules.filter((item) => item.hasContent);
      const firstLiveModule = liveModules[0]
        ? getProjectModule(course.slug, liveModules[0].slug)
        : undefined;
      const projectCount = liveModules.reduce((count, item) => {
        const moduleItem = getProjectModule(course.slug, item.slug);
        return count + moduleItem.projects.length;
      }, 0);

      return { course, liveModules, firstLiveModule, projectCount };
    })
    .sort((a, b) => a.course.title.localeCompare(b.course.title));
}

export function getProjectCourse(courseSlug: string): CourseManifest {
  return readJson<CourseManifest>(path.join(getCourseRoot(courseSlug), "course.json"));
}

export function getProjectModule(
  courseSlug: string,
  moduleSlug: string,
): ModuleManifest {
  return readJson<ModuleManifest>(
    path.join(getModuleRoot(courseSlug, moduleSlug), "module.json"),
  );
}

export function getCourseModules(courseSlug: string): ModuleManifest[] {
  const course = getProjectCourse(courseSlug);

  return course.modules
    .filter((item) => item.hasContent)
    .map((item) => getProjectModule(course.slug, item.slug));
}

export function getLessonHref(courseSlug: string, moduleSlug: string): string {
  return `/projects/${courseSlug}/lessons/${moduleSlug}`;
}

export function getLessonKey(courseSlug: string, moduleSlug: string): string {
  return `lesson:${courseSlug}:${moduleSlug}`;
}

export function getCourseModified(courseSlug: string): Date {
  return fs.statSync(path.join(getCourseRoot(courseSlug), "course.json")).mtime;
}

export function getModuleModified(courseSlug: string, moduleSlug: string): Date {
  return fs.statSync(
    path.join(getModuleRoot(courseSlug, moduleSlug), "module.json"),
  ).mtime;
}

export function getZeroToHeroCourse(): CourseManifest {
  return getProjectCourse("nn-zero-to-hero");
}

export function getMicrogradModule(): ModuleManifest {
  return getProjectModule("nn-zero-to-hero", "01-micrograd");
}

export function getProjectFolderPath(
  courseSlug: string,
  moduleSlug: string,
  projectSlug: string,
): string {
  return path.join(getModuleRoot(courseSlug, moduleSlug), projectSlug);
}
