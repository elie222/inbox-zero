"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Button } from "@/components/ui/button";
import { captureException } from "@/utils/error";

export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    captureException(error);
  }, [error]);

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
