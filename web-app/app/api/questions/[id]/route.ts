import { getQuestionById } from "@/lib/catalog";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const question = getQuestionById(id);
  if (!question) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(question, {
    headers: {
      "cache-control":
        process.env.NODE_ENV === "production"
          ? "public, max-age=31536000, immutable"
          : "no-store",
    },
  });
}
