"use client";

import { authClient } from "@/utils/auth-client";

// Re-export the useSession hook for consistency across the app
export const useSession = authClient.useSession;

// Simple provider that just renders children
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
