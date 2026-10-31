import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Add routes here as we build features that REQUIRE auth. Pages that need
// auth call requireAuth() from lib/auth.ts directly - middleware is only
// used here for explicit blanket protection (e.g. an entire /admin section).
// Everything else falls through; lib/auth.ts handles per-route enforcement.
const isProtectedRoute = createRouteMatcher([
  // "/admin(.*)",
  // "/settings(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
