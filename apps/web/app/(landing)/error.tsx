"use client";

import { LandingErrorBoundary } from "@/components/LandingErrorBoundary";

export default function ErrorBoundary({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return <LandingErrorBoundary error={error} />;
}
