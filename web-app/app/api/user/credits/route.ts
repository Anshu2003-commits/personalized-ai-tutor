import { auth } from "@clerk/nextjs/server";
import { getCreditsInfo } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const info = await getCreditsInfo(userId);
  return Response.json(info);
}
