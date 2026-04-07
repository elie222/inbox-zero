"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertCircle, Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { env } from "@/env";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { createClientLogger } from "@/utils/logger-client";

export function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{
    emailAccountId?: string;
    ruleId?: string;
  }>();

  useEffect(() => {
    const logger = createClientLogger("app-error-boundary");
    logger.error("App error boundary triggered", {
      digest: error.digest,
      emailAccountId: params.emailAccountId,
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
      pathname,
      ruleId: params.ruleId,
      search: searchParams.toString(),
    });
    void logger.flush();
    Sentry.captureException(error);
  }, [error, params.emailAccountId, params.ruleId, pathname, searchParams]);

  return (
    <div className="flex h-full items-center justify-center p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-destructive/10">
            <AlertCircle className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>
            {error.message || "An unexpected error occurred."}
          </EmptyDescription>
        </EmptyHeader>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button onClick={reset} variant="outline">
            <RotateCcw className="mr-2 size-4" />
            Try again
          </Button>
          <Button asChild>
            <Link href="/">
              <Home className="mr-2 size-4" />
              Go home
            </Link>
          </Button>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          If this error persists, please contact support at{" "}
          <a
            href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}
            className="underline"
          >
            {env.NEXT_PUBLIC_SUPPORT_EMAIL}
          </a>
        </p>
      </Empty>
    </div>
  );
}
