export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth } from "@clerk/nextjs/server";
import { checkAndDecrementCredits } from "@/lib/credits";
import { getProjectModule } from "@/lib/project-catalog";

const LLM_APP_URL = process.env.LLM_APP_URL || "http://localhost:8000";

export async function POST(req: Request) {
  const { userId } = await auth();

  // Unauthenticated users can't use the tutor
  if (!userId) {
    return Response.json(
      { error: "sign_in_required", message: "Sign in to use the AI tutor." },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json(
        { error: "invalid_request", message: "Expected a JSON object." },
        { status: 400 },
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Expected a valid JSON request body." },
      { status: 400 },
    );
  }

  const requestedLesson = body.lesson;
  delete body.lesson;
  delete body.context;
  if (requestedLesson && typeof requestedLesson === "object" && !Array.isArray(requestedLesson)) {
    const candidate = requestedLesson as Record<string, unknown>;
    if (typeof candidate.courseSlug === "string" && typeof candidate.moduleSlug === "string") {
      try {
        const lesson = getProjectModule(candidate.courseSlug, candidate.moduleSlug);
        body.context = {
          lesson: {
            courseSlug: lesson.courseSlug,
            moduleSlug: lesson.slug,
            title: lesson.title,
            description: lesson.description,
            videoId: lesson.videoId,
            projects: lesson.projects.map((project) => project.title),
            concepts: Array.from(new Set(lesson.projects.flatMap((project) => project.learn?.concepts ?? []))),
          },
        };
      } catch {
        return Response.json({ error: "invalid_lesson", message: "Lesson not found." }, { status: 400 });
      }
    }
  }

  // Only charge a credit after the request and its server-owned context are valid.
  const credit = await checkAndDecrementCredits(userId);
  if (!credit.allowed) {
    return Response.json(
      {
        error: "credits_exhausted",
        message: "You've used your weekly AI tutor credits. Upgrade for unlimited access.",
        remaining: 0,
      },
      { status: 402 },
    );
  }

  const upstream = await fetch(`${LLM_APP_URL}/chat/v1/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...body,
      ...(userId ? { user_id: `clerk:${userId}` } : {}),
    }),
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(
      `upstream error: ${upstream.status} ${await upstream.text().catch(() => "")}`,
      { status: 502 },
    );
  }

  // Pipe the upstream SSE through, then append a credits event at the end
  // so the client knows the updated balance.
  const upstreamReader = upstream.body.getReader();
  const encoder = new TextEncoder();
  const creditsEvent = `data: ${JSON.stringify({
    type: "credits",
    remaining: credit.remaining,
    isPaid: credit.isPaid,
  })}\n\n`;

  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await upstreamReader.read();
      if (done) {
        controller.enqueue(encoder.encode(creditsEvent));
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      upstreamReader.cancel();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
