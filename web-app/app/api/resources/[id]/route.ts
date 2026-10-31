import { auth } from "@clerk/nextjs/server";
import { connectMongo } from "@/lib/mongo";
import { Resource } from "@/lib/models/resource";
import { computeRankScore, isReportReason } from "@/lib/resources";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as { action?: string; reason?: string };

  await connectMongo();
  const resource = await Resource.findById(id);
  if (!resource || resource.status === "deleted") {
    return Response.json({ error: "resource not found" }, { status: 404 });
  }

  if (body.action === "upvote") {
    const idx = resource.upvotedByClerkIds.indexOf(userId);
    if (idx === -1) resource.upvotedByClerkIds.push(userId);
    else resource.upvotedByClerkIds.splice(idx, 1);
  } else if (body.action === "report") {
    const reportedIdx = resource.reportedByClerkIds.indexOf(userId);
    if (reportedIdx !== -1) {
      resource.reportedByClerkIds.splice(reportedIdx, 1);
      resource.reportReasons.splice(reportedIdx, 1);
      resource.reportCount = resource.reportedByClerkIds.length;
      if (resource.status === "hidden" && resource.reportCount < 5) {
        resource.status = "active";
      }
    } else if (!isReportReason(body.reason)) {
      return Response.json({ error: "bad report reason" }, { status: 400 });
    } else {
      resource.reportedByClerkIds.push(userId);
      resource.reportReasons.push(body.reason);
      resource.reportCount = resource.reportedByClerkIds.length;
      if (resource.reportCount >= 5) resource.status = "hidden";
    }
  } else {
    return Response.json({ error: "bad action" }, { status: 400 });
  }

  resource.rankScore = computeRankScore(resource);
  await resource.save();

  return Response.json({
    id: String(resource._id),
    upvoteCount: resource.upvotedByClerkIds.length,
    reportCount: resource.reportCount,
    status: resource.status,
    viewerUpvoted: resource.upvotedByClerkIds.includes(userId),
    viewerReported: resource.reportedByClerkIds.includes(userId),
  });
}
