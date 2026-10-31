import { auth } from "@clerk/nextjs/server";
import mongoose from "mongoose";
import { connectMongo } from "@/lib/mongo";
import { LessonDiscussion } from "@/lib/models/lesson-discussion";
import { getLessonKey, getProjectModule } from "@/lib/project-catalog";

type Ctx = { params: Promise<{ courseSlug: string; moduleSlug: string; postId: string }> };

export async function PATCH(_req: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "sign_in_required" }, { status: 401 });
  const { courseSlug, moduleSlug, postId } = await ctx.params;
  try { getProjectModule(courseSlug, moduleSlug); } catch { return Response.json({ error: "lesson not found" }, { status: 404 }); }
  if (!mongoose.isValidObjectId(postId)) return Response.json({ error: "discussion not found" }, { status: 404 });
  await connectMongo();
  const post = await LessonDiscussion.findOne({ _id: postId, lessonKey: getLessonKey(courseSlug, moduleSlug) });
  if (!post) return Response.json({ error: "discussion not found" }, { status: 404 });
  const index = post.upvotedByClerkIds.indexOf(userId);
  if (index === -1) post.upvotedByClerkIds.push(userId); else post.upvotedByClerkIds.splice(index, 1);
  await post.save();
  return Response.json({ upvoteCount: post.upvotedByClerkIds.length, viewerUpvoted: index === -1 });
}
