// @vitest-environment jsdom

import * as Sentry from "@sentry/nextjs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/account/mail",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ emailAccountId: "account" }),
}));
vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com" },
}));

afterEach(cleanup);

describe("AppErrorBoundary", () => {
  it("includes the captured event reference in the screen and support link without exposing error details", () => {
    vi.mocked(Sentry.captureException).mockReturnValue("event-reference");
    const error = new Error("Private exception details");
    const reset = vi.fn();
    const onBack = vi.fn();
    render(<AppErrorBoundary error={error} reset={reset} onBack={onBack} />);

    expect(screen.getByText("event-reference")).toBeTruthy();
    expect(screen.queryByText(error.message)).toBeNull();
    const { href } = screen.getByRole<HTMLAnchorElement>("link", {
      name: "support@example.com",
    });
    const body = new URL(href).searchParams.get("body");
    expect(body).toContain("event-reference");
    expect(body).not.toContain(error.message);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.anything(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Back to inbox" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
  it("hides the previous reference while capturing a replacement error", () => {
    vi.mocked(Sentry.captureException).mockReturnValueOnce("previous-event");
    const reset = vi.fn();
    const { rerender } = render(
      <AppErrorBoundary error={new Error("First failure")} reset={reset} />,
    );
    expect(screen.getByText("previous-event")).toBeTruthy();
    vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
      expect(screen.queryByText("previous-event")).toBeNull();
      const { href } = screen.getByRole<HTMLAnchorElement>("link", {
        name: "support@example.com",
      });
      expect(new URL(href).searchParams.get("body")).not.toContain(
        "previous-event",
      );
      return "replacement-event";
    });
    rerender(
      <AppErrorBoundary error={new Error("Second failure")} reset={reset} />,
    );
    expect(screen.getByText("replacement-event")).toBeTruthy();
  });
});
