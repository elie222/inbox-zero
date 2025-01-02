"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TokenCheck() {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session?.error === "RefreshAccessTokenError") {
      router.replace("/login?error=RefreshAccessTokenError");
      return;
    }
    if (session?.error === "RequiresReconsent") {
      router.replace("/login?error=RequiresReconsent");
      return;
    }
  }, [session, router]);

  return null;
}
