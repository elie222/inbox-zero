import type React from "react";
import { Loading } from "./Loading";
import { ErrorDisplay } from "./ErrorDisplay";

interface LoadingContentProps {
  children: React.ReactNode;
  error?: {
    info?: { error?: string; isKnownError?: boolean };
    error?: string;
    status?: number;
  };
  errorComponent?: React.ReactNode;
  loading: boolean;
  loadingComponent?: React.ReactNode;
}

export function LoadingContent(props: LoadingContentProps) {
  const ignoreError = shouldIgnoreError(props.error);

  if (props.error && !ignoreError) {
    return props.errorComponent ? (
      props.errorComponent
    ) : (
      <div className="mt-4">
        <ErrorDisplay error={props.error} />
      </div>
    );
  }

  // In dev mode with ignored error, show loading while retrying
  if (props.loading || ignoreError)
    return <>{props.loadingComponent || <Loading />}</>;

  return <>{props.children}</>;
}

// In development, ignore 404 errors (likely transient HMR errors), unless the
// API sent one on purpose and the user is meant to read it.
function shouldIgnoreError(error: LoadingContentProps["error"]): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (error?.info?.isKnownError) return false;
  return error?.status === 404;
}
