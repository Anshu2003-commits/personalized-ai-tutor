import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { connectMongo } from "./mongo";
import { User, type UserDoc } from "./models/user";

export type AppUser = {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  image: string | null;
  aiCredits: number;
  subscriptionStatus: "free" | "active" | "past_due" | "canceled";
  preferredTrack: string | null;
};

function toAppUser(doc: UserDoc): AppUser {
  return {
    id: doc._id.toString(),
    clerkId: doc.clerkId,
    email: doc.email,
    name: doc.name ?? null,
    image: doc.image ?? null,
    aiCredits: doc.aiCredits,
    subscriptionStatus: doc.subscriptionStatus,
    preferredTrack: doc.preferredTrack ?? null,
  };
}

/** Returns the signed-in user's Mongo record, or null if not signed in. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  await connectMongo();
  let doc = await User.findOne({ clerkId: userId });

  // Lazy-create: if Clerk says the user exists but Mongo doesn't yet have a
  // record (webhook lag or local dev without webhook configured), backfill from
  // Clerk's profile.
  if (!doc) {
    const clerkUser = await currentUser();
    if (!clerkUser) return null;
    doc = await User.create({
      clerkId: userId,
      email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
      name:
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        null,
      image: clerkUser.imageUrl ?? null,
    });
  }

  return toAppUser(doc);
}

/** Redirects to /sign-in if not authenticated; otherwise returns the user. */
export async function requireAuth(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Returns the Clerk session info (userId + sessionId), or null. */
export async function getSession(): Promise<{
  userId: string;
  sessionId: string | null;
} | null> {
  const { userId, sessionId } = await auth();
  if (!userId) return null;
  return { userId, sessionId: sessionId ?? null };
}
