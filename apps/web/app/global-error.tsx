"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Button } from "@/components/ui/button";
import { captureException } from "@/utils/error";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

// biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
export default function GlobalError({ error }: any) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  // This replaces the root layout, so the providers never signal. The page
  // offers its own reload, so the desktop shell shouldn't replace it.
  useEffect(() => {
    getInboxZeroDesktopApp()?.signalReady?.();
  }, []);

  return (
    <html lang="en">
      <body className="p-4">
        <ErrorDisplay error={{ error: error?.message }} />

        <div className="mt-4">
          <Button onClick={() => window.location.reload()}>Reload Page</Button>
        </div>
      </body>
    </html>
  );
}
