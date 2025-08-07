"use client";

import { authClient } from "@/utils/auth-client";

export const useSession = authClient.useSession;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
