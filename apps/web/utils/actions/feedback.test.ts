import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitFeedbackAction } from "./feedback";

const trackProductFeedbackMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

vi.mock("@/utils/posthog", () => ({
  trackProductFeedback: trackProductFeedbackMock,
}));

describe("submitFeedbackAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trackProductFeedbackMock.mockResolvedValue(undefined);
  });

  it("sends feedback to PostHog for the authenticated user", async () => {
    const result = await submitFeedbackAction({
      feedback: "Love the assistant chat",
    });

    expect(result?.serverError).toBeUndefined();
    expect(result?.validationErrors).toBeUndefined();
    expect(trackProductFeedbackMock).toHaveBeenCalledWith(
      "user@example.com",
      "Love the assistant chat",
    );
  });

  it("rejects empty feedback", async () => {
    const result = await submitFeedbackAction({
      feedback: "   ",
    });

    expect(result?.validationErrors).toBeDefined();
    expect(trackProductFeedbackMock).not.toHaveBeenCalled();
  });
});
