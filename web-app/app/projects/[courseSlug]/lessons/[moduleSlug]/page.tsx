import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VideoLesson from "@/components/video-lesson";
import {
  getCourseModules,
  getProjectCourse,
  getProjectCourses,
  getProjectModule,
} from "@/lib/project-catalog";

type Props = {
  params: Promise<{ courseSlug: string; moduleSlug: string }>;
};

export function generateStaticParams() {
  return getProjectCourses().flatMap(({ course, liveModules }) =>
    liveModules.map((moduleItem) => ({
      courseSlug: course.slug,
      moduleSlug: moduleItem.slug,
    })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseSlug, moduleSlug } = await params;
  try {
    const course = getProjectCourse(courseSlug);
    const lesson = getProjectModule(courseSlug, moduleSlug);
    return {
      title: `${lesson.title} | ${course.title} | Onlearn`,
      description: lesson.description,
      alternates: { canonical: `/projects/${courseSlug}/lessons/${moduleSlug}` },
    };
  } catch {
    return { title: "Lesson not found | Onlearn" };
  }
}

export default async function LessonPage({ params }: Props) {
  const { courseSlug, moduleSlug } = await params;
  let course: ReturnType<typeof getProjectCourse>;
  let lesson: ReturnType<typeof getProjectModule>;
  let lessons: ReturnType<typeof getCourseModules>;
  try {
    course = getProjectCourse(courseSlug);
    lesson = getProjectModule(courseSlug, moduleSlug);
    lessons = getCourseModules(courseSlug);
  } catch {
    notFound();
  }
  const index = lessons.findIndex((item) => item.slug === lesson.slug);
  if (index === -1) notFound();

  return (
    <VideoLesson
      course={course}
      lesson={lesson}
      previousLesson={index > 0 ? lessons[index - 1] : null}
      nextLesson={index < lessons.length - 1 ? lessons[index + 1] : null}
    />
  );
}
