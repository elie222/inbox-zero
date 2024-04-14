"use client";

import React from "react";
import * as Sentry from "@sentry/nextjs";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    Sentry.captureException(error, errorInfo);
  }
  render() {
    if (this.state.hasError) return <div>Something went wrong :(</div>;
    return this.props.children;
  }
}
