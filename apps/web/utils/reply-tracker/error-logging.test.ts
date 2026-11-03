import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
import {
  captureException,
  markAsHandledUserKeyError,
  SafeError,
} from "@/utils/error";
import { createTestLogger } from "@/__tests__/helpers";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";
import { logReplyTrackerError } from "@/utils/reply-tracker/error-logging";

vi.mock("@/utils/log-error-with-dedupe", () => ({
  logErrorWithDedupe: vi.fn(),
}));
vi.mock("@/utils/error", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/error")>()),
  captureException: vi.fn(),
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
    ["invalid key", 401, "Incorrect API key provided"],
    ["unavailable model", 400, "model is not available"],
    [
      "exhausted balance",
      400,
      "Your credit balance is too low to access the Anthropic API.",
    ],
  ])("keeps application-owned %s failures at error level and routes them to capture", async (_name, statusCode, message) => {
    const error = new APICallError({
      message,
      statusCode,
      url: "https://api.example.com",
      requestBodyValues: {},
    });
    await logReplyTrackerError({
      logger: createTestLogger(),
      emailAccountId: "account-1",
      scope: "test",
      message: "Reply tracking failed",
      operation: "test",
      error,
      capture: true,
    });
    expect(logErrorWithDedupe).toHaveBeenCalledWith(
      expect.objectContaining({ level: "error" }),
    );
    expect(captureException).toHaveBeenCalledWith(error, {
      emailAccountId: "account-1",
    });
  });

  it("keeps handled user-key failures and safe account states at warning level", async () => {
    const userKeyError = new APICallError({
      message: "Incorrect API key provided",
      statusCode: 401,
      url: "https://api.example.com",
      requestBodyValues: {},
    });
    markAsHandledUserKeyError(userKeyError);
    for (const error of [userKeyError, new SafeError("Usage limit reached")]) {
      await logReplyTrackerError({
        logger: createTestLogger(),
        emailAccountId: "account-1",
        scope: "test",
        message: "Reply tracking failed",
        operation: "test",
        error,
        capture: true,
      });
    }
    expect(logErrorWithDedupe).toHaveBeenCalledTimes(2);
    expect(logErrorWithDedupe).toHaveBeenCalledWith(
      expect.objectContaining({ level: "warn" }),
    );
    expect(captureException).not.toHaveBeenCalled();
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
