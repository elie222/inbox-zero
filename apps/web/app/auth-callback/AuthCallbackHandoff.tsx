"use client";

import { useEffect } from "react";
import { redirectToSafeUrl } from "@/utils/redirect";

export function AuthCallbackHandoff({ href }: { href: string }) {
  useEffect(() => {
    redirectToSafeUrl(href, { allowAppCallback: true });
  }, [href]);

  return null;
}
