"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export function SentryIdentify({ email }: { email: string }) {
  useEffect(() => {
    Sentry.setUser({ email });
  }, [email]);

  return null;
}
