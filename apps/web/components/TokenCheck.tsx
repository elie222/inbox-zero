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
    }
  }, [session, router]);

  return null;
}
