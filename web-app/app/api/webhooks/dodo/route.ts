import type { NextRequest } from "next/server";
import { Webhooks } from "@dodopayments/nextjs";
import { connectMongo } from "@/lib/mongo";
import { User } from "@/lib/models/user";

async function updateSubscriptionStatus(
  subscriptionId: string,
  status: "active" | "past_due" | "canceled",
  customerId?: string,
) {
  await connectMongo();

  const update: Record<string, unknown> = {
    subscriptionStatus: status,
    dodoSubscriptionId: subscriptionId,
  };
  if (customerId) update.dodoCustomerId = customerId;

  // Match by dodoSubscriptionId if it exists, otherwise by dodoCustomerId
  await User.findOneAndUpdate(
    {
      $or: [
        { dodoSubscriptionId: subscriptionId },
        ...(customerId ? [{ dodoCustomerId: customerId }] : []),
        ...(customerId ? [{ email: customerId }] : []),
      ],
    },
    { $set: update },
  );
}

// Constructed lazily so `next build` (which evaluates route modules without
// runtime secrets) doesn't require the webhook key to be present.
let handler: ReturnType<typeof Webhooks> | null = null;

function getHandler(): ReturnType<typeof Webhooks> {
  if (handler) return handler;
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  if (!webhookKey) throw new Error("DODO_PAYMENTS_WEBHOOK_KEY is not set");
  handler = buildHandler(webhookKey);
  return handler;
}

export async function POST(req: NextRequest): Promise<Response> {
  return getHandler()(req);
}

const buildHandler = (webhookKey: string) => Webhooks({
  webhookKey,

  onSubscriptionActive: async (payload) => {
    const sub = payload.data;
    await updateSubscriptionStatus(
      sub.subscription_id,
      "active",
      sub.customer?.customer_id,
    );
  },

  onSubscriptionRenewed: async (payload) => {
    const sub = payload.data;
    await updateSubscriptionStatus(
      sub.subscription_id,
      "active",
      sub.customer?.customer_id,
    );
  },

  onSubscriptionOnHold: async (payload) => {
    const sub = payload.data;
    await updateSubscriptionStatus(sub.subscription_id, "past_due");
  },

  onSubscriptionCancelled: async (payload) => {
    const sub = payload.data;
    await updateSubscriptionStatus(sub.subscription_id, "canceled");
  },

  onSubscriptionExpired: async (payload) => {
    const sub = payload.data;
    await updateSubscriptionStatus(sub.subscription_id, "canceled");
  },

  onSubscriptionFailed: async (payload) => {
    const sub = payload.data;
    await updateSubscriptionStatus(sub.subscription_id, "canceled");
  },

  onPayload: async () => {
    // catch-all for unhandled events - no-op
  },
});
