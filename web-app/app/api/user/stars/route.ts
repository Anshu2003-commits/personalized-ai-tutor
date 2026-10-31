import { auth } from "@clerk/nextjs/server";
import { connectMongo } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { User } from "@/lib/models/user";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  await connectMongo();
  const user = await User.findOne({ clerkId: userId }).lean();
  return Response.json({ starred: user?.starredQuestions ?? [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as { questionId?: string };
  if (!body.questionId) {
    return Response.json({ error: "missing questionId" }, { status: 400 });
  }

  // Lazy-create the Mongo record if the webhook hasn't landed yet, same as
  // the other authed routes.
  await getCurrentUser();

  await connectMongo();
  const user = await User.findOne({ clerkId: userId });
  if (!user) {
    return Response.json({ error: "user not found" }, { status: 404 });
  }

  const idx = user.starredQuestions.indexOf(body.questionId);
  const starred = idx === -1;
  if (starred) user.starredQuestions.push(body.questionId);
  else user.starredQuestions.splice(idx, 1);
  await user.save();

  return Response.json({ questionId: body.questionId, starred });
}
