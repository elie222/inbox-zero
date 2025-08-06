"use client";

import { useSession } from "@/utils/auth-client";

export { useSession };

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
