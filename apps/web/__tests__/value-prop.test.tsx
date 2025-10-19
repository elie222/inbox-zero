import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ValuePropContent } from "@/app/(landing)/value-prop/ValuePropContent";

// Mock dependencies
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: vi.fn(),
}));

vi.mock("@/utils/actions/onboarding", () => ({}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID: "test-survey-id",
    NEXT_PUBLIC_APP_HOME_PATH: "/mail",
  },
}));

import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { env } from "@/env";

describe("ValuePropContent Component", () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue(mockRouter);
    (usePostHog as any).mockReturnValue(mockPostHog);
  });

  describe("Rendering Tests", () => {
    it("should render with user name in heading", () => {
      render(<ValuePropContent userName="John" />);

      expect(
        screen.getByText(/Let's help you reclaim your focus, John\./i),
      ).toBeInTheDocument();
    });

    it("should render subheading with value proposition", () => {
      render(<ValuePropContent userName="John" />);

      expect(
        screen.getByText(
          /Inbox Zero turns your inbox into two simple daily briefs/i,
        ),
      ).toBeInTheDocument();
    });

    it("should render all 4 value proposition cards", () => {
      render(<ValuePropContent userName="John" />);

      // Check all titles are present
      expect(screen.getByText("Morning Brief")).toBeInTheDocument();
      expect(screen.getByText("One-Click Actions")).toBeInTheDocument();
      expect(
        screen.getByText("Track Important Conversations"),
      ).toBeInTheDocument();
      expect(screen.getByText("No Clutter, No Noise")).toBeInTheDocument();
    });

    it("should render all value prop descriptions", () => {
      render(<ValuePropContent userName="John" />);

      expect(
        screen.getByText(
          /Your curated digest of what matters, delivered at 8am/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Quick unsubscribe, archive, and organize with a single click/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Never miss a reply or forget to follow up/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Block cold emails and focus on what actually matters/i,
        ),
      ).toBeInTheDocument();
    });

    it("should render privacy reassurance text", () => {
      render(<ValuePropContent userName="John" />);

      expect(
        screen.getByText(/You'll connect your inbox next/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/we only read what's new since you joined/i),
      ).toBeInTheDocument();
    });

    it("should render Continue button", () => {
      render(<ValuePropContent userName="John" />);

      const button = screen.getByRole("button", { name: /continue/i });
      expect(button).toBeInTheDocument();
    });

    it("should handle user name with special characters", () => {
      render(<ValuePropContent userName="O'Brien" />);

      expect(
        screen.getByText(/Let's help you reclaim your focus, O'Brien\./i),
      ).toBeInTheDocument();
    });

    it("should handle empty string user name", () => {
      render(<ValuePropContent userName="" />);

      expect(
        screen.getByText(/Let's help you reclaim your focus, \./i),
      ).toBeInTheDocument();
    });

    it("should handle generic fallback name", () => {
      render(<ValuePropContent userName="there" />);

      expect(
        screen.getByText(/Let's help you reclaim your focus, there\./i),
      ).toBeInTheDocument();
    });
  });

  describe("Continue Button Interaction Tests", () => {
    it("should navigate to /connect-gmail when continue is clicked", async () => {
      const user = userEvent.setup();
      render(<ValuePropContent userName="John" />);

      const button = screen.getByRole("button", { name: /continue/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith("/connect-gmail");
      });
    });

    it("should fire PostHog event on Continue click", async () => {
      const user = userEvent.setup();
      render(<ValuePropContent userName="Jane" />);

      const button = screen.getByRole("button", { name: /continue/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockPostHog.capture).toHaveBeenCalledWith(
          "value_prop_continue_clicked",
          { user_name: "Jane" },
        );
      });
    });

    it("should handle missing PostHog gracefully", async () => {
      (usePostHog as any).mockReturnValue(null);
      const user = userEvent.setup();
      render(<ValuePropContent userName="John" />);

      const button = screen.getByRole("button", { name: /continue/i });
      await user.click(button);

      // Should not throw error, should still navigate
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith("/connect-gmail");
      });
    });

    it("should navigate to /connect-gmail regardless of PostHog configuration", async () => {
      // Mock env without PostHog survey
      (env as any).NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID = "";

      const user = userEvent.setup();
      render(<ValuePropContent userName="John" />);

      const button = screen.getByRole("button", { name: /continue/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith("/connect-gmail");
      });

      // Restore env
      (env as any).NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID = "test-survey-id";
    });

    it("should handle multiple clicks gracefully", async () => {
      const user = userEvent.setup();
      render(<ValuePropContent userName="John" />);

      const button = screen.getByRole("button", { name: /continue/i });

      // Click multiple times rapidly
      await user.click(button);
      await user.click(button);
      await user.click(button);

      // Should still work (not throw errors)
      expect(mockRouter.push).toHaveBeenCalled();
    });
  });

  describe("Value Propositions Content Tests", () => {
    it("should render all value props in correct order", () => {
      render(<ValuePropContent userName="John" />);

      const cards = screen.getAllByText(/Brief|Actions|Conversations|Clutter/);

      // Verify order
      expect(cards[0]).toHaveTextContent("Morning Brief");
      expect(cards[1]).toHaveTextContent("One-Click Actions");
      expect(cards[2]).toHaveTextContent("Track Important Conversations");
      expect(cards[3]).toHaveTextContent("No Clutter, No Noise");
    });

    it("should have proper styling classes for value prop cards", () => {
      const { container } = render(<ValuePropContent userName="John" />);

      // Check for grid layout
      const gridContainer = container.querySelector(".grid");
      expect(gridContainer).toBeInTheDocument();

      // Check for value prop cards styling
      const cards = container.querySelectorAll(".rounded-lg.bg-gray-50");
      expect(cards.length).toBe(4);
    });

    it("should render icons for all value props", () => {
      const { container } = render(<ValuePropContent userName="John" />);

      // Check that there are 4 icons (one for each value prop)
      const icons = container.querySelectorAll(".text-blue-600");
      expect(icons.length).toBe(4);
    });
  });

  describe("Accessibility Tests", () => {
    it("should have accessible button", () => {
      render(<ValuePropContent userName="John" />);

      const button = screen.getByRole("button", { name: /continue/i });
      expect(button).toBeEnabled();
    });

    it("should have proper heading hierarchy", () => {
      const { container } = render(<ValuePropContent userName="John" />);

      // Check for main heading (PageHeading typically renders as h1)
      const headings = container.querySelectorAll("h1, h2, h3");
      expect(headings.length).toBeGreaterThan(0);
    });

    it("should render all text content without hidden elements", () => {
      render(<ValuePropContent userName="John" />);

      // Ensure no critical content is hidden
      expect(screen.getByText(/Morning Brief/i)).toBeVisible();
      expect(screen.getByText(/One-Click Actions/i)).toBeVisible();
      expect(screen.getByText(/Track Important Conversations/i)).toBeVisible();
      expect(screen.getByText(/No Clutter, No Noise/i)).toBeVisible();
    });
  });

  describe("Responsive Design Tests", () => {
    it("should have responsive button classes", () => {
      render(<ValuePropContent userName="John" />);

      const button = screen.getByRole("button", { name: /continue/i });

      // Check for responsive width classes (w-full sm:w-auto)
      expect(button.className).toMatch(/w-full/);
    });

    it("should have grid layout for value props", () => {
      const { container } = render(<ValuePropContent userName="John" />);

      const gridContainer = container.querySelector(".grid");
      expect(gridContainer).toBeInTheDocument();
      expect(gridContainer?.className).toMatch(/gap-/);
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long user names", () => {
      const longName = "A".repeat(100);
      render(<ValuePropContent userName={longName} />);

      expect(
        screen.getByText(
          new RegExp(`Let's help you reclaim your focus, ${longName}\\.`),
        ),
      ).toBeInTheDocument();
    });

    it("should handle user names with emojis", () => {
      render(<ValuePropContent userName="John 😊" />);

      expect(
        screen.getByText(/Let's help you reclaim your focus, John 😊\./i),
      ).toBeInTheDocument();
    });

    it("should handle user names with numbers", () => {
      render(<ValuePropContent userName="User123" />);

      expect(
        screen.getByText(/Let's help you reclaim your focus, User123\./i),
      ).toBeInTheDocument();
    });

    it("should render without errors when PostHog is undefined", () => {
      (usePostHog as any).mockReturnValue(undefined);

      expect(() => {
        render(<ValuePropContent userName="John" />);
      }).not.toThrow();
    });

    it("should render without crashing when router is undefined", async () => {
      (useRouter as any).mockReturnValue(undefined);

      // Component should still render
      expect(() => {
        render(<ValuePropContent userName="John" />);
      }).not.toThrow();

      const button = screen.getByRole("button", { name: /continue/i });
      expect(button).toBeInTheDocument();

      // Note: Clicking will throw an error since router.push is undefined
      // This is expected behavior - the component renders but button won't work
    });
  });

  describe("Content Validation", () => {
    it("should contain correct morning brief description", () => {
      render(<ValuePropContent userName="John" />);

      expect(
        screen.getByText(
          /Your curated digest of what matters, delivered at 8am/i,
        ),
      ).toBeInTheDocument();
    });

    it("should mention 'two simple daily briefs' in subheading", () => {
      render(<ValuePropContent userName="John" />);

      expect(screen.getByText(/two simple daily briefs/i)).toBeInTheDocument();
    });

    it("should mention 'morning' and 'evening' in subheading", () => {
      render(<ValuePropContent userName="John" />);

      const subheading = screen.getByText(
        /one in the morning, one in the evening/i,
      );
      expect(subheading).toBeInTheDocument();
    });

    it("should contain privacy message about reading only new emails", () => {
      render(<ValuePropContent userName="John" />);

      expect(
        screen.getByText(/we only read what's new since you joined/i),
      ).toBeInTheDocument();
    });
  });
});
