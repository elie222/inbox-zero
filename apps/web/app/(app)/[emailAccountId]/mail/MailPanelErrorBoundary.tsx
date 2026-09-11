"use client";

import { Component, type ReactNode } from "react";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

type Props = {
  children: ReactNode;
  resetKey: string;
  title: string;
  onBack?: () => void;
};

export class MailPanelErrorBoundary extends Component<
  Props,
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
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
          <AppErrorBoundary
            error={this.state.error}
            reset={this.reset}
            title={this.props.title}
            description="Try again, or select another folder or conversation. If the problem continues, contact support with the reference below."
            onBack={this.props.onBack}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
