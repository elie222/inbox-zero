"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { ErrorDisplay } from "@/components/ErrorDisplay";

export default function GlobalError({ error }: any) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="p-4">
        <ErrorDisplay error={{ error: error?.message }} />
      </body>
    </html>
  );
}
