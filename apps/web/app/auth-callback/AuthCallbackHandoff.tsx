"use client";

import { useEffect } from "react";

const APP_CALLBACK_PREFIX = "inboxzero://auth-callback";

export function AuthCallbackHandoff({ href }: { href: string }) {
  useEffect(() => {
    if (!href.startsWith(APP_CALLBACK_PREFIX)) return;
    window.location.assign(href);
  }, [href]);

  return null;
}
