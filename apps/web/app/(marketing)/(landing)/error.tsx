"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Button } from "@/components/Button";
import { logOut } from "@/utils/user";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="p-4">
      <ErrorDisplay error={{ error: error?.message }} />
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button onClick={() => logOut()}>Log out</Button>
      </div>
    </div>
  );
}
