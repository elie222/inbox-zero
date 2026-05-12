/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  afterEach(() => {
    cleanup();
  });

  it("starts Apple sign-in when the Apple option is shown", async () => {
    mockSignInSocial.mockResolvedValue(undefined);

    render(<LoginForm showAppleLogin useGoogleOauthEmulator />);

    fireEvent.click(
      screen.getByRole("button", { name: /sign in with apple/i }),
    );

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: "apple",
        callbackURL: "/connect-mailbox?next=%2Fwelcome-redirect",
        errorCallbackURL: "/login/error",
      });
    });
  });

  it("preserves next path for Apple sign-in", async () => {
    mockUseSearchParams.mockReturnValue({
      get: (key: string) =>
        key === "next" ? "/organizations/invitations/invite_123/accept" : null,
    });
    mockSignInSocial.mockResolvedValue(undefined);

    render(<LoginForm showAppleLogin useGoogleOauthEmulator />);

    fireEvent.click(
      screen.getByRole("button", { name: /sign in with apple/i }),
    );

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: "apple",
        callbackURL:
          "/connect-mailbox?next=%2Forganizations%2Finvitations%2Finvite_123%2Faccept",
        errorCallbackURL: "/login/error?reason=org_invite",
      });
    });
  });
});
