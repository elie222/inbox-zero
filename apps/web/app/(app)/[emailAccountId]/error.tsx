"use client";

import RootAppErrorBoundary from "@/app/(app)/error";

export default function EmailAccountErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RootAppErrorBoundary error={error} reset={reset} />;
}
