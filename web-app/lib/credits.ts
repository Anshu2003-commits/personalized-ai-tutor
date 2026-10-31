import "server-only";
import { connectMongo } from "./mongo";
import { User } from "./models/user";

const MAX_CREDITS = 100;
const REFILL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type CreditCheckResult = {
  allowed: boolean;
  remaining: number;
  isPaid: boolean;
  refilled: boolean;
};

export async function checkAndDecrementCredits(
  clerkId: string,
): Promise<CreditCheckResult> {
  await connectMongo();
  const user = await User.findOne({ clerkId });
  if (!user) {
    return { allowed: false, remaining: 0, isPaid: false, refilled: false };
  }

  // Paid users bypass credit system entirely
  if (user.subscriptionStatus === "active") {
    return { allowed: true, remaining: MAX_CREDITS, isPaid: true, refilled: false };
  }

  // Lazy weekly refill: if more than 7 days since last refill, reset to max
  const now = new Date();
  const msSinceRefill = now.getTime() - user.aiCreditsRefilledAt.getTime();
  let refilled = false;

  if (msSinceRefill >= REFILL_INTERVAL_MS) {
    await User.updateOne(
      { clerkId },
      { $set: { aiCredits: MAX_CREDITS, aiCreditsRefilledAt: now } },
    );
    refilled = true;
    return {
      allowed: true,
      remaining: MAX_CREDITS - 1,
      isPaid: false,
      refilled: true,
    };
  }

  if (user.aiCredits <= 0) {
    return { allowed: false, remaining: 0, isPaid: false, refilled: false };
  }

  // Atomic decrement
  const result = await User.findOneAndUpdate(
    { clerkId, aiCredits: { $gt: 0 } },
    { $inc: { aiCredits: -1 } },
    { new: true },
  );

  if (!result) {
    return { allowed: false, remaining: 0, isPaid: false, refilled: false };
  }

  return {
    allowed: true,
    remaining: result.aiCredits,
    isPaid: false,
    refilled,
  };
}

export async function getCreditsInfo(
  clerkId: string,
): Promise<{
  credits: number;
  maxCredits: number;
  refilledAt: Date;
  isPaid: boolean;
}> {
  await connectMongo();
  const user = await User.findOne({ clerkId });
  if (!user) {
    return {
      credits: 0,
      maxCredits: MAX_CREDITS,
      refilledAt: new Date(),
      isPaid: false,
    };
  }

  // Apply lazy refill on read too (so the display is always current)
  const now = new Date();
  const msSinceRefill = now.getTime() - user.aiCreditsRefilledAt.getTime();
  if (msSinceRefill >= REFILL_INTERVAL_MS) {
    await User.updateOne(
      { clerkId },
      { $set: { aiCredits: MAX_CREDITS, aiCreditsRefilledAt: now } },
    );
    return {
      credits: MAX_CREDITS,
      maxCredits: MAX_CREDITS,
      refilledAt: now,
      isPaid: user.subscriptionStatus === "active",
    };
  }

  return {
    credits: user.aiCredits,
    maxCredits: MAX_CREDITS,
    refilledAt: user.aiCreditsRefilledAt,
    isPaid: user.subscriptionStatus === "active",
  };
}
