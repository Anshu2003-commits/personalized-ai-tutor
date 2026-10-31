import { Webhook } from "svix";
import { connectMongo } from "@/lib/mongo";
import { User } from "@/lib/models/user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ClerkUserData = {
  id: string;
  email_addresses: Array<{ email_address: string; id: string }>;
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
};

type ClerkEvent =
  | { type: "user.created" | "user.updated"; data: ClerkUserData }
  | { type: "user.deleted"; data: { id: string } }
  | { type: string; data: unknown };

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("CLERK_WEBHOOK_SECRET not configured", { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  const body = await req.text();

  let event: ClerkEvent;
  try {
    event = new Webhook(secret).verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkEvent;
  } catch (e) {
    return new Response(
      `Signature verification failed: ${e instanceof Error ? e.message : String(e)}`,
      { status: 401 },
    );
  }

  await connectMongo();

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const u = event.data as ClerkUserData;
      const primaryEmail =
        u.email_addresses.find((e) => e.id === u.primary_email_address_id)
          ?.email_address ??
        u.email_addresses[0]?.email_address ??
        "";
      const fullName =
        [u.first_name, u.last_name].filter(Boolean).join(" ") || null;

      await User.findOneAndUpdate(
        { clerkId: u.id },
        {
          $set: {
            clerkId: u.id,
            email: primaryEmail,
            name: fullName,
            image: u.image_url ?? null,
          },
          $setOnInsert: {
            aiCredits: 100,
            aiCreditsRefilledAt: new Date(),
            subscriptionStatus: "free",
          },
        },
        { upsert: true, new: true },
      );
      break;
    }

    case "user.deleted": {
      const { id } = event.data as { id: string };
      await User.deleteOne({ clerkId: id });
      break;
    }

    default:
      break; // ignore unhandled events (org.*, session.*, etc.)
  }

  return Response.json({ ok: true });
}
