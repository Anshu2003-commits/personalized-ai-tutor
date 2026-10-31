import { auth } from "@clerk/nextjs/server";
import { buildLessonQuiz, publicLessonQuiz } from "@/lib/lesson-quiz";
import { connectMongo } from "@/lib/mongo";
import { LessonQuizAttempt, type LessonQuizAttemptDoc } from "@/lib/models/lesson-quiz-attempt";
import { getLessonKey, getProjectModule } from "@/lib/project-catalog";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ courseSlug: string; moduleSlug: string }> };

function lessonFor(courseSlug: string, moduleSlug: string) {
  try {
    return getProjectModule(courseSlug, moduleSlug);
  } catch {
    return null;
  }
}

function reviewFor(lesson: NonNullable<ReturnType<typeof lessonFor>>, answers: number[]) {
  return buildLessonQuiz(lesson).map((question, index) => ({
    id: question.id,
    selectedIndex: answers[index],
    correctIndex: question.correctIndex,
    correct: answers[index] === question.correctIndex,
    explanation: question.explanation,
  }));
}

export async function GET(_req: Request, ctx: Ctx) {
  const { courseSlug, moduleSlug } = await ctx.params;
  const lesson = lessonFor(courseSlug, moduleSlug);
  if (!lesson) return Response.json({ error: "lesson not found" }, { status: 404 });

  const { userId } = await auth();
  let attempt = null;
  if (userId) {
    await connectMongo();
    attempt = await LessonQuizAttempt.findOne({
      clerkId: userId,
      lessonKey: getLessonKey(courseSlug, moduleSlug),
    }).lean();
  }

  return Response.json({
    questions: publicLessonQuiz(lesson),
    attempt: attempt
      ? {
          attemptCount: attempt.attemptCount,
          bestScore: attempt.bestScore,
          lastScore: attempt.lastScore,
          review: reviewFor(lesson, attempt.lastAnswers),
        }
      : null,
    maxAttempts: 3,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "sign_in_required" }, { status: 401 });
  const { courseSlug, moduleSlug } = await ctx.params;
  const lesson = lessonFor(courseSlug, moduleSlug);
  if (!lesson) return Response.json({ error: "lesson not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { answers?: unknown } | null;
  const quiz = buildLessonQuiz(lesson);
  if (
    !Array.isArray(body?.answers) ||
    body.answers.length !== quiz.length ||
    !body.answers.every((answer, index) =>
      Number.isInteger(answer) && Number(answer) >= 0 && Number(answer) < quiz[index].options.length,
    )
  ) {
    return Response.json({ error: "answer every question" }, { status: 400 });
  }
  const answers = body.answers.map(Number);
  const score = quiz.reduce((total, question, index) => total + Number(answers[index] === question.correctIndex), 0);
  const lessonKey = getLessonKey(courseSlug, moduleSlug);

  await connectMongo();
  const existing = await LessonQuizAttempt.findOne({ clerkId: userId, lessonKey });
  if (existing && existing.attemptCount >= 3) {
    return Response.json({ error: "attempt_limit", attemptCount: existing.attemptCount }, { status: 409 });
  }

  const filter = { clerkId: userId, lessonKey, attemptCount: { $lt: 3 } };
  const update = {
    $inc: { attemptCount: 1 },
    $max: { bestScore: score },
    $set: { lastScore: score, lastAnswers: answers },
    $setOnInsert: { clerkId: userId, lessonKey },
  };
  let attempt: LessonQuizAttemptDoc | null;
  try {
    attempt = await LessonQuizAttempt.findOneAndUpdate(filter, update, {
      new: true,
      upsert: !existing,
      runValidators: true,
    });
  } catch (error) {
    // Two first submissions can race the unique index. The loser should still
    // count as a real attempt instead of surfacing a server error.
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) throw error;
    attempt = await LessonQuizAttempt.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    });
  }
  if (!attempt) return Response.json({ error: "attempt_limit" }, { status: 409 });

  return Response.json({
    score,
    total: quiz.length,
    attemptCount: attempt.attemptCount,
    bestScore: attempt.bestScore,
    review: reviewFor(lesson, answers),
  });
}
