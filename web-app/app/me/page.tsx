import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await requireAuth();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="mb-6 text-xl font-medium tracking-tight">
        Signed in (lib/auth.ts → Mongo)
      </h1>
      <div className="space-y-3 rounded-md border border-border bg-card p-4 text-sm">
        <Row label="App user id" value={user.id} />
        <Row label="Clerk id" value={user.clerkId} />
        <Row label="Email" value={user.email} />
        <Row label="Name" value={user.name ?? "-"} />
        <Row label="AI credits" value={String(user.aiCredits)} />
        <Row label="Subscription" value={user.subscriptionStatus} />
        <Row label="Preferred track" value={user.preferredTrack ?? "-"} />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        If you can see this, sign-in works, Mongo is connected, and the
        lib/auth.ts abstraction returned a Mongo-backed AppUser. The user
        document was lazy-created on first visit (since the Clerk webhook
        isn&apos;t registered yet for localhost).
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
