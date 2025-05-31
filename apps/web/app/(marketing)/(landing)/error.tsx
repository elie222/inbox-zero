"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Button } from "@/components/Button";
import { logOut } from "@/utils/user";

export default function ErrorBoundary({ error }: any) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="p-4">
      <ErrorDisplay error={{ error: error?.message }} />
      <Button className="mt-2" onClick={() => logOut()}>
        Log out
      </Button>
    </div>
  );
}
