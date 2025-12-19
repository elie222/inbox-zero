"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { useAccount } from "@/providers/EmailAccountProvider";

export function SentryIdentify({ email }: { email: string }) {
  const { emailAccountId } = useAccount();

  useEffect(() => {
    Sentry.setUser({ email });
  }, [email]);

  useEffect(() => {
    if (emailAccountId) {
      Sentry.setTag("emailAccountId", emailAccountId);
    } else {
      Sentry.setTag("emailAccountId", undefined);
    }
  }, [emailAccountId]);

  return null;
}
