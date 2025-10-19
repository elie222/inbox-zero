import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectGmailContent } from "./ConnectGmailContent";

// Mock dependencies
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: vi.fn(),
}));

vi.mock("@/utils/auth-client", () => ({
  useSession: vi.fn(),
}));

vi.mock("swr", () => ({
  default: vi.fn(),
}));

import { useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useSession } from "@/utils/auth-client";
import useSWR from "swr";

describe("ConnectGmailContent Component", () => {
  const mockRouter = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  };

  const mockPostHog = {
    capture: vi.fn(),
  };

  const mockSession = {
    user: { id: "user-123", email: "test@example.com" },
  };

  const mockSearchParams = {
    get: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue(mockRouter);
    (usePostHog as any).mockReturnValue(mockPostHog);
    (useSession as any).mockReturnValue({ data: mockSession });
    (useSearchParams as any).mockReturnValue(mockSearchParams);

    // Default SWR mock
    (useSWR as any).mockReturnValue({
      data: null,
      isLoading: false,
    });
  });

  describe("Rendering Tests", () => {
    it("should render with correct heading", () => {
      render(<ConnectGmailContent userName="John" />);

      expect(screen.getByText("Connect your inbox.")).toBeInTheDocument();
    });

    it("should render description text", () => {
      render(<ConnectGmailContent userName="John" />);

      expect(
        screen.getByText(
          /Unlock calm, twice-daily briefs that summarize what matters most/,
        ),
      ).toBeInTheDocument();
    });

    it("should render all 3 benefit bullet points", () => {
      render(<ConnectGmailContent userName="John" />);

      expect(screen.getByText("Placeholder 1")).toBeInTheDocument();
      expect(screen.getByText("Placeholder 2")).toBeInTheDocument();
      expect(screen.getByText("Placeholder 3")).toBeInTheDocument();
    });

    it("should render Continue with Gmail button", () => {
      render(<ConnectGmailContent userName="John" />);

      const button = screen.getByRole("button", {
        name: /continue with gmail/i,
      });
      expect(button).toBeInTheDocument();
    });

    it("should render Google API policy text", () => {
      render(<ConnectGmailContent userName="John" />);

      expect(
        screen.getByText(/Google API Services User Data Policy/),
      ).toBeInTheDocument();
    });
  });

  describe("Button Interaction Tests", () => {
    it("should be disabled when auth URL is not loaded", () => {
      (useSWR as any).mockReturnValue({
        data: null,
        isLoading: false,
      });

      render(<ConnectGmailContent userName="John" />);

      const button = screen.getByRole("button", {
        name: /continue with gmail/i,
      });
      expect(button).toBeDisabled();
    });

    it("should be enabled when auth URL is loaded", () => {
      (useSWR as any).mockReturnValue({
        data: { url: "https://accounts.google.com/o/oauth2/v2/auth?..." },
        isLoading: false,
      });

      render(<ConnectGmailContent userName="John" />);

      const button = screen.getByRole("button", {
        name: /continue with gmail/i,
      });
      expect(button).not.toBeDisabled();
    });

    it("should show loading state when fetching auth URL", () => {
      (useSWR as any).mockReturnValue({
        data: null,
        isLoading: true,
      });

      render(<ConnectGmailContent userName="John" />);

      const button = screen.getByRole("button", {
        name: /continue with gmail/i,
      });
      expect(button).toBeDisabled();
    });

    it("should redirect to OAuth URL when button is clicked", async () => {
      const authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=test";

      (useSWR as any).mockReturnValue({
        data: { url: authUrl },
        isLoading: false,
      });

      // Mock window.location.href
      (window as any).location = undefined;
      window.location = { href: "" } as any;

      const user = userEvent.setup();
      render(<ConnectGmailContent userName="John" />);

      const button = screen.getByRole("button", {
        name: /continue with gmail/i,
      });
      await user.click(button);

      expect(window.location.href).toBe(authUrl);
    });

    it("should fire PostHog event on button click", async () => {
      const authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=test";

      (useSWR as any).mockReturnValue({
        data: { url: authUrl },
        isLoading: false,
      });

      (window as any).location = undefined;
      window.location = { href: "" } as any;

      const user = userEvent.setup();
      render(<ConnectGmailContent userName="John" />);

      const button = screen.getByRole("button", {
        name: /continue with gmail/i,
      });
      await user.click(button);

      await waitFor(() => {
        expect(mockPostHog.capture).toHaveBeenCalledWith(
          "connect_gmail_clicked",
          { user_name: "John" },
        );
      });
    });
  });

  describe("Error Handling Tests", () => {
    it("should display error alert when error param is present", () => {
      mockSearchParams.get.mockReturnValue("connection_failed");

      render(<ConnectGmailContent userName="John" />);

      expect(screen.getByText("Connection failed")).toBeInTheDocument();
      expect(
        screen.getByText(/There was an error connecting your Gmail account/),
      ).toBeInTheDocument();
    });

    it("should not display error alert when no error param", () => {
      mockSearchParams.get.mockReturnValue(null);

      render(<ConnectGmailContent userName="John" />);

      expect(screen.queryByText("Connection failed")).not.toBeInTheDocument();
    });

    it("should handle missing PostHog gracefully", async () => {
      (usePostHog as any).mockReturnValue(null);

      const authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=test";

      (useSWR as any).mockReturnValue({
        data: { url: authUrl },
        isLoading: false,
      });

      (window as any).location = undefined;
      window.location = { href: "" } as any;

      const user = userEvent.setup();
      render(<ConnectGmailContent userName="John" />);

      const button = screen.getByRole("button", {
        name: /continue with gmail/i,
      });

      // Should not throw error
      await expect(user.click(button)).resolves.not.toThrow();
    });
  });

  describe("SWR Integration Tests", () => {
    it("should call SWR with correct parameters when user is authenticated", () => {
      render(<ConnectGmailContent userName="John" />);

      expect(useSWR).toHaveBeenCalledWith(
        "/api/google/gmail/auth-url",
        expect.any(Object),
      );
    });

    it("should not call SWR when user is not authenticated", () => {
      (useSession as any).mockReturnValue({ data: null });

      render(<ConnectGmailContent userName="John" />);

      expect(useSWR).toHaveBeenCalledWith(null, expect.any(Object));
    });
  });
});
