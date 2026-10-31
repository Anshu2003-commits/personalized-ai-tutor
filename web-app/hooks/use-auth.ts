"use client";

import { useAuth as useClerkAuth, useUser } from "@clerk/nextjs";

export type ClientUser = {
  clerkId: string;
  email: string;
  name: string | null;
  image: string | null;
};

export function useAuth(): {
  user: ClientUser | null;
  isSignedIn: boolean;
  isLoaded: boolean;
} {
  const { isLoaded: authLoaded, isSignedIn } = useClerkAuth();
  const { isLoaded: userLoaded, user: clerkUser } = useUser();

  const isLoaded = authLoaded && userLoaded;

  if (!isLoaded || !isSignedIn || !clerkUser) {
    return { user: null, isSignedIn: !!isSignedIn, isLoaded };
  }

  return {
    user: {
      clerkId: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
      name:
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        null,
      image: clerkUser.imageUrl ?? null,
    },
    isSignedIn: true,
    isLoaded: true,
  };
}
