import { auth, currentUser } from "@clerk/nextjs/server";
import { connectMongo } from "@/lib/mongo";
import { Resource } from "@/lib/models/resource";
import { ResourceComment } from "@/lib/models/resource-comment";
import { cleanText, isAdminEmail } from "@/lib/resources";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as { text?: string; parentCommentId?: string | null };
  const text = cleanText(body.text, 1_000);
  if (!text) {
    return Response.json({ error: "missing comment text" }, { status: 400 });
  }

  await connectMongo();
  const resource = await Resource.findById(id);
  if (!resource || resource.status === "deleted") {
    return Response.json({ error: "resource not found" }, { status: 404 });
  }
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? null;
  const name =
    cleanText([user?.firstName, user?.lastName].filter(Boolean).join(" "), 80) ||
    cleanText(email, 80) ||
    "Onlearn user";

  const comment = await ResourceComment.create({
    resourceId: resource._id,
    parentCommentId: body.parentCommentId || null,
    text,
    createdByClerkId: userId,
    createdByName: name,
    isAdmin: isAdminEmail(email),
  });

  return Response.json(
    {
      id: String(comment._id),
      resourceId: String(comment.resourceId),
      parentCommentId: comment.parentCommentId ? String(comment.parentCommentId) : null,
      text: comment.text,
      createdByName: comment.createdByName,
      isAdmin: comment.isAdmin,
      upvoteCount: 0,
      viewerUpvoted: false,
      createdAt: comment.createdAt,
    },
    { status: 201 },
  );
}
