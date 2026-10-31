import { auth } from "@clerk/nextjs/server";
import { connectMongo } from "@/lib/mongo";
import { User } from "@/lib/models/user";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const { preferredTrack } = (await req.json()) as {
    preferredTrack: string;
  };

  if (!["dsa", "ds", "both"].includes(preferredTrack)) {
    return Response.json({ error: "invalid track" }, { status: 400 });
  }

  await connectMongo();
  await User.updateOne(
    { clerkId: userId },
    { $set: { preferredTrack } },
    { upsert: false },
  );

  return Response.json({ ok: true, preferredTrack });
}
