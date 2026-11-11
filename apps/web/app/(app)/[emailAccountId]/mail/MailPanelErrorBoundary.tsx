"use client";

import { Component, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

type Props = {
  children: ReactNode;
  resetKey: string;
  title: string;
  onBack?: () => void;
  onError?: () => void;
};

export class MailPanelErrorBoundary extends Component<
  Props,
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  componentDidUpdate(previousProps: Props) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-0 min-w-0 flex-1 overflow-auto" role="alert">
          <MailPanelErrorFallback
            error={this.state.error}
            reset={this.reset}
            title={this.props.title}
            onBack={this.props.onBack}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

function MailPanelErrorFallback({
  error,
  reset,
  title,
  onBack,
}: {
  error: Error;
  reset: () => void;
  title: string;
  onBack?: () => void;
}) {
  const { t } = useLingui();
  return (
    <AppErrorBoundary
      error={error}
      reset={reset}
      title={title}
      description={t`Try again, or select another folder or conversation. If the problem continues, contact support with the reference below.`}
      onBack={onBack}
    />
  );
}
