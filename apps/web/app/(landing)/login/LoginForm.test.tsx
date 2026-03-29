/** @vitest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseSearchParams = vi.fn();
const mockSignInWithOauth2 = vi.fn();
const mockSignInSocial = vi.fn();
const mockToastError = vi.fn();

(globalThis as { React?: typeof React }).React = React;

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("next/image", () => ({
  default: ({
    unoptimized: _unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    // biome-ignore lint/performance/noImgElement: test-only mock
    <img
      {...props}
      alt={props.alt || ""}
      width={Number(props.width) || 1}
      height={Number(props.height) || 1}
    />
  ),
}));

vi.mock("@/utils/auth-client", () => ({
  signInWithOauth2: (...args: Parameters<typeof mockSignInWithOauth2>) =>
    mockSignInWithOauth2(...args),
  signIn: {
    social: (...args: Parameters<typeof mockSignInSocial>) =>
      mockSignInSocial(...args),
  },
}));

vi.mock("@/components/Toast", () => ({
  toastError: (...args: Parameters<typeof mockToastError>) =>
    mockToastError(...args),
}));

import { LoginForm } from "@/app/(landing)/login/LoginForm";

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchParams.mockReturnValue({
      get: () => null,
    });
  });

  it("shows an inline error when emulator sign-in fails", async () => {
    mockSignInWithOauth2.mockRejectedValue(
      new Error("Failed to connect to Google sign-in."),
    );

    render(<LoginForm useGoogleOauthEmulator />);

    fireEvent.click(
      screen.getByRole("button", { name: /sign in with google/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "I agree" }));

    expect(
      await screen.findByText("Failed to start Google sign-in"),
    ).toBeTruthy();
    expect(
      screen.getByText("Failed to connect to Google sign-in."),
    ).toBeTruthy();

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith({
        title: "Error signing in with Google",
        description: "Failed to connect to Google sign-in.",
      });
    });
  });
});
