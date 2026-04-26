"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { createClientLogger } from "@/utils/logger-client";

export class ErrorBoundary extends Component<
  {
    children: ReactNode;
    extra?: Record<string, unknown>;
    fallback?: ReactNode;
    logMessage?: string;
    logScope?: string;
  },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(_error: Error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (this.props.logScope) {
      const logger = createClientLogger(this.props.logScope);

      logger.error(this.props.logMessage || "Error boundary triggered", {
        errorMessage: error?.message,
        errorName: error?.name,
        ...this.props.extra,
      });
      logger.flush().catch(() => undefined);
    }

    Sentry.captureException(error, { ...errorInfo, extra: this.props.extra });
  }
  render() {
    if (this.state.hasError)
      return this.props.fallback ?? <div>Something went wrong :(</div>;

    return this.props.children;
  }
}
