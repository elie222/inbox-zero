"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertCircle, Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { env } from "@/env";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getAppErrorBoundaryLogContext } from "@/components/app-error-boundary-log-context";
import { createClientLogger } from "@/utils/logger-client";

export function AppErrorBoundary({
  error,
  reset,
  title = "Something went wrong",
  description,
  onBack,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
  onBack?: () => void;
}) {
  const [supportReference, setSupportReference] = useState<string>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{
    emailAccountId?: string;
    ruleId?: string;
  }>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: log each boundary error once with the route context captured at that time
  useEffect(() => {
    const logger = createClientLogger("app-error-boundary");
    const context = getAppErrorBoundaryLogContext({
      error,
      params,
      pathname,
      searchParams,
    });
    // Correlate with the exception details without copying raw error text into Axiom.
    const sentryEventId = Sentry.captureException(error, { extra: context });
    setSupportReference(sentryEventId);
    logger.error("App error boundary triggered", {
      ...context,
      sentryEventId,
    });
    logger.flush().catch(() => undefined);
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-destructive/10">
            <AlertCircle className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>
            {description ||
              "We couldn’t load this view. Try again. If the problem continues, contact support with the reference below."}
          </EmptyDescription>
        </EmptyHeader>
        <div className="mt-6 flex flex-col flex-wrap justify-center gap-2 sm:flex-row">
          <Button onClick={reset} variant="outline">
            <RotateCcw className="mr-2 size-4" />
            Try again
          </Button>
          {onBack && (
            <Button onClick={onBack} variant="outline">
              Back to inbox
            </Button>
          )}
          <Button asChild>
            <Link href="/">
              <Home className="mr-2 size-4" />
              Go home
            </Link>
          </Button>
        </div>
        {supportReference && (
          <p className="break-all text-xs text-muted-foreground">
            Support reference:{" "}
            <span className="select-all font-mono">{supportReference}</span>
          </p>
        )}
        <p className="mt-6 text-sm text-muted-foreground">
          If this error persists, please contact support at{" "}
          <a
            href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}?${new URLSearchParams({ subject: "App error report", body: `Support reference: ${supportReference || error.digest || "Unavailable"}` })}`}
            className="break-all underline"
          >
            {env.NEXT_PUBLIC_SUPPORT_EMAIL}
          </a>
        </p>
      </Empty>
    </div>
  );
}
