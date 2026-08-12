import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitFeedbackAction } from "./feedback";

const { envMock, fetchMock, trackProductFeedbackMock } = vi.hoisted(() => ({
  envMock: {
    NODE_ENV: "test",
    FEEDBACK_WEBHOOK_URL: undefined as string | undefined,
  },
  fetchMock: vi.fn(),
  trackProductFeedbackMock: vi.fn(),
}));

vi.mock("@/env", () => ({ env: envMock }));

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
    vi.stubGlobal("fetch", fetchMock);
    envMock.FEEDBACK_WEBHOOK_URL = undefined;
    fetchMock.mockResolvedValue({ ok: true });
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

  it("sends the authenticated user's email and feedback to the configured webhook", async () => {
    envMock.FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";

    const result = await submitFeedbackAction({
      feedback: "Love the assistant chat",
    });

    expect(result?.serverError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: expect.anything(),
        body: JSON.stringify({
          text: "New product feedback received",
          blocks: [
            {
              type: "section",
              text: {
                type: "plain_text",
                text: "User: user@example.com",
              },
            },
            {
              type: "section",
              text: {
                type: "plain_text",
                text: "Love the assistant chat",
              },
            },
          ],
        }),
      },
    );
  });

  it("does not call a webhook when none is configured", async () => {
    await submitFeedbackAction({ feedback: "Love the assistant chat" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves long feedback across Slack section blocks", async () => {
    envMock.FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
    const feedback = "a".repeat(5000);

    await submitFeedbackAction({ feedback });

    const request = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(request.body);
    const feedbackSections = payload.blocks.slice(1);

    expect(feedbackSections).toHaveLength(2);
    expect(
      feedbackSections
        .map((block: { text: { text: string } }) => block.text.text)
        .join(""),
    ).toBe(feedback);
  });

  it("accepts feedback when the configured webhook fails", async () => {
    envMock.FEEDBACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
    fetchMock.mockRejectedValue(new Error("Slack unavailable"));

    const result = await submitFeedbackAction({
      feedback: "Love the assistant chat",
    });

    expect(result?.serverError).toBeUndefined();
    expect(trackProductFeedbackMock).toHaveBeenCalled();
  });

  it("rejects empty feedback", async () => {
    const result = await submitFeedbackAction({
      feedback: "   ",
    });

    expect(result?.validationErrors).toBeDefined();
    expect(trackProductFeedbackMock).not.toHaveBeenCalled();
  });
});
