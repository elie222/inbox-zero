import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";
import { logReplyTrackerError } from "@/utils/reply-tracker/error-logging";

vi.mock("@/utils/log-error-with-dedupe", () => ({
  logErrorWithDedupe: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
}));

describe("logReplyTrackerError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      "Outlook throttling",
      Object.assign(
        new Error("Application is over its MailboxConcurrency limit."),
        { code: "ApplicationThrottled" },
      ),
      "warn",
    ],
    ["unexpected errors", new Error("Unexpected failure"), "error"],
  ])("logs %s at the expected level", async (_caseName, error, level) => {
    await logReplyTrackerError({
      logger: createTestLogger(),
      emailAccountId: "account-1",
      scope: "handle-outbound",
      message: "Error handling outbound reply",
      operation: "handle-outbound-reply",
      error,
      capture: true,
    });

    expect(logErrorWithDedupe).toHaveBeenCalledWith(
      expect.objectContaining({ level }),
    );
  });
});
