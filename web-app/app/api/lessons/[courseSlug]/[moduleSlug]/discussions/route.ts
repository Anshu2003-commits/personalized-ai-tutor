import mongoose from "mongoose";
import { auth, currentUser } from "@clerk/nextjs/server";
import { connectMongo } from "@/lib/mongo";
import { LessonDiscussion, type LessonDiscussionDoc } from "@/lib/models/lesson-discussion";
import { getLessonKey, getProjectModule } from "@/lib/project-catalog";
import { cleanText } from "@/lib/resources";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ courseSlug: string; moduleSlug: string }> };

function validLesson(courseSlug: string, moduleSlug: string) {
  try { getProjectModule(courseSlug, moduleSlug); return true; } catch { return false; }
}

function serialize(post: LessonDiscussionDoc, userId: string | null) {
  return {
    id: String(post._id),
    body: post.body,
    kind: post.kind,
    parentId: post.parentId ? String(post.parentId) : null,
    author: post.createdByName,
    upvoteCount: post.upvotedByClerkIds.length,
    viewerUpvoted: userId ? post.upvotedByClerkIds.includes(userId) : false,
    createdAt: post.createdAt,
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { courseSlug, moduleSlug } = await ctx.params;
  if (!validLesson(courseSlug, moduleSlug)) return Response.json({ error: "lesson not found" }, { status: 404 });
  const { userId } = await auth();
  await connectMongo();
  const posts = await LessonDiscussion.find({ lessonKey: getLessonKey(courseSlug, moduleSlug) })
    .sort({ createdAt: -1 }).limit(100);
  return Response.json({ posts: posts.map((post) => serialize(post, userId)) });
}

export async function POST(req: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "sign_in_required" }, { status: 401 });
  const { courseSlug, moduleSlug } = await ctx.params;
  if (!validLesson(courseSlug, moduleSlug)) return Response.json({ error: "lesson not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { body?: string; kind?: string; parentId?: string } | null;
  const text = cleanText(body?.body, 2_000);
  if (text.length < 2) return Response.json({ error: "write at least two characters" }, { status: 400 });
  const lessonKey = getLessonKey(courseSlug, moduleSlug);
  let parentId: mongoose.Types.ObjectId | null = null;
  await connectMongo();
  if (body?.parentId) {
    if (!mongoose.isValidObjectId(body.parentId)) return Response.json({ error: "invalid reply" }, { status: 400 });
    const parent = await LessonDiscussion.findOne({ _id: body.parentId, lessonKey, parentId: null });
    if (!parent) return Response.json({ error: "discussion not found" }, { status: 404 });
    parentId = parent._id;
  }
  const user = await currentUser();
  const name = cleanText(
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.emailAddresses[0]?.emailAddress || "Onlearn learner",
    80,
  );
  const post = await LessonDiscussion.create({
    lessonKey, body: text, kind: body?.kind === "insight" ? "insight" : "question",
    parentId, createdByClerkId: userId, createdByName: name,
  });
  return Response.json({ post: serialize(post, userId) }, { status: 201 });
}
