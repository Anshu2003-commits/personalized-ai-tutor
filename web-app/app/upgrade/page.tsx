"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const PLANS = [
  {
    id: "monthly",
    name: "Monthly",
    price: "₹1,199",
    period: "/month",
    productId: process.env.NEXT_PUBLIC_DODO_MONTHLY_PRODUCT_ID ?? "",
  },
  {
    id: "annual",
    name: "Annual",
    price: "₹7,999",
    period: "/year",
    highlight: true,
    savings: "₹6,389 saved vs monthly",
    productId: process.env.NEXT_PUBLIC_DODO_ANNUAL_PRODUCT_ID ?? "",
  },
] as const;

export default function UpgradePage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function checkout(productId: string, planId: string) {
    if (!productId) {
      alert("Product not configured yet. Set NEXT_PUBLIC_DODO_MONTHLY/ANNUAL_PRODUCT_ID in .env.local.");
      return;
    }
    setLoading(planId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.assign(data.checkout_url);
      } else {
        alert("Checkout failed. Please try again.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Upgrade
      </p>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Unlimited AI tutor
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Keep solving with your AI mentor at your side. No weekly credit limits.
      </p>

      <div className="mt-10 grid w-full gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col items-center rounded-md border p-6 ${
              "highlight" in plan && plan.highlight
                ? "border-foreground"
                : "border-border"
            }`}
          >
            <span className="text-xs text-muted-foreground">{plan.name}</span>
            <span className="mt-2 text-3xl font-semibold">{plan.price}</span>
            <span className="text-xs text-muted-foreground">{plan.period}</span>
            {"savings" in plan && (
              <span className="mt-1 text-[10px] text-emerald-400">
                {plan.savings}
              </span>
            )}
            <Button
              className="mt-6 w-full"
              onClick={() => checkout(plan.productId, plan.id)}
              disabled={loading !== null}
            >
              {loading === plan.id ? "Redirecting…" : `Choose ${plan.name}`}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-2 text-xs text-muted-foreground">
        <p>Unlimited AI tutor messages on all tracks</p>
        <p>Multi-language code execution (C++, Java, Go, Rust)</p>
        <p>Cancel anytime · Powered by Dodo Payments</p>
      </div>

      <Link
        href="/"
        className="mt-10 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        back to learning paths
      </Link>
    </main>
  );
}
