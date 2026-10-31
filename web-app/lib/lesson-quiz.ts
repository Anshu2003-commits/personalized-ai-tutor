import type { ModuleManifest } from "@/lib/project-catalog";
import { getCourseModules } from "@/lib/project-catalog";

export type LessonQuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function choices(correct: string, distractors: string[]) {
  return [correct, ...unique(distractors).filter((item) => item !== correct)].slice(0, 4);
}

export function buildLessonQuiz(lesson: ModuleManifest): LessonQuizQuestion[] {
  const modules = getCourseModules(lesson.courseSlug);
  const otherProjects = modules
    .filter((item) => item.slug !== lesson.slug)
    .flatMap((item) => item.projects);
  const project = lesson.projects[0];
  const concept = project?.learn?.concepts[0] ?? "the lesson's core implementation";

  return [
    {
      id: "build-goal",
      prompt: "What is the main build goal for this lesson?",
      options: choices(
        project?.title ?? lesson.title,
        otherProjects.map((item) => item.title),
      ),
      correctIndex: 0,
      explanation: `The guided build for this lesson is “${project?.title ?? lesson.title}.”`,
    },
    {
      id: "core-concept",
      prompt: "Which concept is central to the first guided project?",
      options: choices(
        concept,
        otherProjects.flatMap((item) => item.learn?.concepts ?? []),
      ),
      correctIndex: 0,
      explanation: `The project explicitly focuses on ${concept}.`,
    },
    {
      id: "next-step",
      prompt: "What is the best next step after watching the lesson?",
      options: [
        "Start the guided project and test the idea in code",
        "Skip directly to the final course module",
        "Memorize the transcript without implementing anything",
        "Copy a finished solution before attempting the project",
      ],
      correctIndex: 0,
      explanation: "The project turns the lecture into practice and gives the tutor concrete work to review.",
    },
  ];
}

export function publicLessonQuiz(lesson: ModuleManifest) {
  return buildLessonQuiz(lesson).map(({ id, prompt, options }) => ({ id, prompt, options }));
}
