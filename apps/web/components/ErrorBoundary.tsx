"use client";

import { Component } from "react";
import * as Sentry from "@sentry/nextjs";

export class ErrorBoundary extends Component<
  { children: React.ReactNode; extra?: unknown; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(_error: unknown) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }
  componentDidCatch(error: unknown, errorInfo: unknown) {
    console.log({ error, errorInfo });
    Sentry.captureException(error, { ...errorInfo, extra: this.props.extra });
  }
  render() {
    if (this.state.hasError)
      return this.props.fallback ?? <div>Something went wrong :(</div>;

    return this.props.children;
  }
}
