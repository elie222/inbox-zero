"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Settings } from "lucide-react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

interface AdminPluginErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminPluginError({
  error,
  reset,
}: AdminPluginErrorProps) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { component: "admin-plugins" },
    });
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/30">
            <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
        </div>

        <h2 className="mb-2 text-xl font-semibold text-foreground">
          Plugin Admin Error
        </h2>

        <p className="mb-6 text-sm text-muted-foreground">
          Something went wrong while loading the plugin administration page.
        </p>

        {error.digest && (
          <p className="mb-4 font-mono text-xs text-muted-foreground">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset} variant="default" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/admin">
              <Settings className="h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
