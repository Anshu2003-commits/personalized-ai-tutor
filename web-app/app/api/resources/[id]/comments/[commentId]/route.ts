import { auth } from "@clerk/nextjs/server";
import { connectMongo } from "@/lib/mongo";
import { ResourceComment } from "@/lib/models/resource-comment";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; commentId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }
  const { id, commentId } = await ctx.params;
  const body = (await req.json()) as { action?: string };
  if (body.action !== "upvote") {
    return Response.json({ error: "bad action" }, { status: 400 });
  }

  await connectMongo();
  const comment = await ResourceComment.findOne({ _id: commentId, resourceId: id });
  if (!comment) {
    return Response.json({ error: "comment not found" }, { status: 404 });
  }
  const idx = comment.upvotedByClerkIds.indexOf(userId);
  if (idx === -1) comment.upvotedByClerkIds.push(userId);
  else comment.upvotedByClerkIds.splice(idx, 1);
  await comment.save();

  return Response.json({
    id: String(comment._id),
    upvoteCount: comment.upvotedByClerkIds.length,
    viewerUpvoted: comment.upvotedByClerkIds.includes(userId),
  });
}
