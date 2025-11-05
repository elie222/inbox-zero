"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Button } from "@/components/Button";
import { logOut } from "@/utils/user";

export default function ErrorBoundary({ error }: { error: unknown }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="p-4">
      {(() => {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : undefined;
        return <ErrorDisplay error={{ error: message ?? "Unknown error" }} />;
      })()}
      <Button className="mt-2" onClick={() => logOut()}>
        Log out
      </Button>
    </div>
  );
}
