"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame } from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { TRACKS, type TrackSlug } from "@/lib/types";

type TrackSummary = { solved: number; total: number; streak: number };

/** Lightweight CSS-only tooltip. These stats aren't clickable, so the label
 *  explains what each number means on hover/focus. */
function StatTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex items-center" tabIndex={0}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+0.6rem)] z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover/tip:opacity-100 group-focus/tip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

function isActiveTrack(pathname: string, track: TrackSlug): boolean {
  return pathname === `/${track}` || pathname.startsWith(`/${track}/`);
}

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const NAV_ITEMS = [
  ...TRACKS.map((track) => ({
    href: `/${track.slug}` as const,
    label: track.title,
  })),
  { href: "/projects", label: "Projects" },
  { href: "/guides", label: "Guides" },
];

export default function NavHeader() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const activeTrack =
    TRACKS.find((t) => isActiveTrack(pathname, t.slug))?.slug ?? null;
  const [stats, setStats] = useState<
    (TrackSummary & { track: TrackSlug }) | null
  >(null);

  // Track-level solved / progress / streak for the nav bar, refetched per track.
  // Cached stats are tagged with their track so stale numbers never render while
  // a new track's summary is in flight.
  useEffect(() => {
    if (!isSignedIn || !activeTrack) return;
    let cancelled = false;
    fetch(`/api/user/progress?track=${activeTrack}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TrackSummary | null) => {
        if (!cancelled && d) {
          setStats({
            track: activeTrack,
            solved: d.solved,
            total: d.total,
            streak: d.streak,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTrack, isSignedIn]);

  // Hide the global nav where the screen owns its chrome: Clerk-scaffolded auth
  // routes (clean full-screen) and the tutor/solve screens (their own top bar).
  // The tutor match is track-agnostic: /<track>/tutor/... for any track.
  if (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    /^\/[^/]+\/tutor(\/|$)/.test(pathname)
  ) {
    return null;
  }

  return (
    <header className="h-14 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight"
          >
            Onlearn
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isTrack = item.href.startsWith("/dsa") || item.href.startsWith("/ds");
              const active = isTrack
                ? isActiveTrack(pathname, item.href.slice(1) as TrackSlug)
                : isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                    (active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">Sign up</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            {activeTrack && stats && stats.track === activeTrack && (
              <>
                <div className="hidden items-center sm:flex">
                  <StatTip label={`${stats.streak}-day streak`}>
                    <span className="inline-flex h-7 min-w-10 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 font-mono text-xs tabular-nums text-foreground">
                      <Flame
                        className={
                          "h-3.5 w-3.5 " +
                          (stats.streak > 0
                            ? "fill-orange-500 text-orange-500"
                            : "text-muted-foreground")
                        }
                      />
                      <span>{stats.streak}</span>
                    </span>
                  </StatTip>
                </div>
                <span
                  aria-hidden
                  className="hidden h-5 w-px bg-border sm:block"
                />
              </>
            )}
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
