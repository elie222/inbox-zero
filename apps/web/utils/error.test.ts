import { describe, it, expect, vi, beforeEach } from "vitest";
import { APICallError, NoObjectGeneratedError } from "ai";
import { createScopedLogger } from "@/utils/logger";

const { mockSentryCaptureException, mockSetUser } = vi.hoisted(() => ({
  mockSentryCaptureException: vi.fn(),
  mockSetUser: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mockSentryCaptureException,
  setUser: mockSetUser,
}));

import {
  attachLlmRepairMetadata,
  captureException,
  checkCommonErrors,
  getActionErrorMessage,
  getUserFacingErrorMessage,
  isInsufficientCreditsError,
  isContentFilterRefusal,
  isHandledUserKeyError,
  isKnownApiError,
  isKnownOutlookError,
  isOutlookAccessDeniedError,
  isOutlookItemNotFoundError,
  isOutlookThrottlingError,
  markAsHandledUserKeyError,
} from "./error";

describe("getUserFacingErrorMessage", () => {
  it.each([
    [
      "plain error message",
      new Error("Something failed"),
      undefined,
      "Something failed",
    ],
    [
      "structured JSON message",
      new Error(
        JSON.stringify({
          code: 502,
          message: "Invalid arguments passed to the model.",
          metadata: { provider_name: "xAI" },
        }),
      ),
      undefined,
      "Invalid arguments passed to the model.",
    ],
    [
      "direct string error from structured payload",
      new Error(JSON.stringify({ error: "Too many requests" })),
      undefined,
      "Too many requests",
    ],
    [
      "nested message from structured error payload",
      new Error(
        JSON.stringify({
          error: { message: "Upstream model rejected this request." },
        }),
      ),
      undefined,
      "Upstream model rejected this request.",
    ],
    ["fallback when no message can be extracted", {}, "Fallback", "Fallback"],
  ])("returns %s", (_caseName, error, fallback, expected) => {
    const result =
      fallback === undefined
        ? getUserFacingErrorMessage(error)
        : getUserFacingErrorMessage(error, fallback);

    expect(result).toBe(expected);
  });
});

describe("captureException", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards attached LLM repair metadata to Sentry extra context", () => {
    const error = new Error("generation failed");
    const llmRepair = createLlmRepairMetadata();

    attachLlmRepairMetadata(error, llmRepair);
    captureException(error, {
      userEmail: "user@example.com",
      extra: { operation: "test" },
    });

    expect(mockSetUser).toHaveBeenCalledWith({ email: "user@example.com" });
    expect(mockSentryCaptureException).toHaveBeenCalledWith(error, {
      extra: {
        operation: "test",
        llmRepair,
      },
    });
  });

  it("ignores LLM repair metadata for non-extensible errors", () => {
    const error = Object.preventExtensions(new Error("generation failed"));

    expect(() =>
      attachLlmRepairMetadata(error, createLlmRepairMetadata()),
    ).not.toThrow();

    captureException(error, {
      extra: { operation: "test" },
    });

    expect(mockSentryCaptureException).toHaveBeenCalledWith(error, {
      extra: {
        operation: "test",
      },
    });
  });
});

describe("getActionErrorMessage", () => {
  const cases: Array<
    [string, ActionErrorInput, ActionErrorOptions | undefined, string]
  > = [
    [
      "serverError when present",
      { serverError: "Database connection failed" },
      undefined,
      "Database connection failed",
    ],
    [
      "validation errors from flattened validationErrors shape",
      {
        validationErrors: {
          formErrors: ["Form is invalid"],
          fieldErrors: {
            email: ["Email is required"],
            password: ["Password too short"],
          },
        },
      },
      undefined,
      "Form is invalid. Email is required. Password too short",
    ],
    [
      "only field errors when no form errors",
      {
        validationErrors: {
          formErrors: [],
          fieldErrors: {
            name: ["Name must be at least 10 characters"],
          },
        },
      },
      undefined,
      "Name must be at least 10 characters",
    ],
    [
      "bindArgsValidationErrors when validationErrors is empty",
      {
        validationErrors: {
          formErrors: [],
          fieldErrors: {},
        },
        bindArgsValidationErrors: [
          {
            formErrors: ["Invalid account ID"],
            fieldErrors: {},
          },
        ],
      },
      undefined,
      "Invalid account ID",
    ],
    [
      "first non-empty bindArgsValidationErrors entry",
      {
        bindArgsValidationErrors: [
          undefined,
          {
            formErrors: [],
            fieldErrors: {},
          },
          {
            formErrors: ["Third entry error"],
            fieldErrors: {},
          },
        ],
      },
      undefined,
      "Third entry error",
    ],
    [
      "fallback when no errors are present",
      {},
      undefined,
      "An unknown error occurred",
    ],
    [
      "custom fallback when provided",
      {},
      "Something went wrong",
      "Something went wrong",
    ],
    [
      "serverError before validation errors",
      {
        serverError: "Server error",
        validationErrors: {
          formErrors: ["Validation error"],
          fieldErrors: {},
        },
      },
      undefined,
      "Server error",
    ],
    [
      "validationErrors before bindArgsValidationErrors",
      {
        validationErrors: {
          formErrors: ["Input validation error"],
          fieldErrors: {},
        },
        bindArgsValidationErrors: [
          {
            formErrors: ["Bind args error"],
            fieldErrors: {},
          },
        ],
      },
      undefined,
      "Input validation error",
    ],
  ];

  it.each(cases)("returns %s", (_caseName, error, options, expected) => {
    const result =
      options === undefined
        ? getActionErrorMessage(error)
        : getActionErrorMessage(error, options);

    expect(result).toBe(expected);
  });

  describe("with prefix option", () => {
    it.each([
      [
        "prepended to server error",
        { serverError: "Invalid input" },
        { prefix: "Failed to save" },
        "Failed to save. Invalid input",
      ],
      [
        "returned alone when no error message exists",
        {},
        { prefix: "Failed to save" },
        "Failed to save",
      ],
      [
        "prepended to validation errors",
        {
          validationErrors: {
            formErrors: [],
            fieldErrors: { name: ["Name is required"] },
          },
        },
        { prefix: "Failed to update user" },
        "Failed to update user. Name is required",
      ],
      [
        "preferred over fallback when no error exists",
        {},
        { prefix: "Failed to save", fallback: "Please try again" },
        "Failed to save",
      ],
      [
        "absent when only fallback is provided",
        {},
        { fallback: "Custom fallback message" },
        "Custom fallback message",
      ],
    ] satisfies Array<
      [string, ActionErrorInput, ActionErrorOptions, string]
    >)("handles prefix when %s", (_caseName, error, options, expected) => {
      expect(getActionErrorMessage(error, options)).toBe(expected);
    });
  });
});

describe("isInsufficientCreditsError", () => {
  it.each([
    ["HTTP 402 status code", 402, true],
    ["other status codes", 429, false],
  ])("returns %s for %s", (expectedLabel, statusCode, expected) => {
    const error = createAPICallError({
      message: expectedLabel,
      statusCode,
    });

    expect(isInsufficientCreditsError(error)).toBe(expected);
  });
});

describe("markAsHandledUserKeyError / isHandledUserKeyError", () => {
  it("marks and detects handled user key errors", () => {
    const error = createAPICallError({
      message: "Insufficient credits",
      statusCode: 402,
    });
    expect(isHandledUserKeyError(error)).toBe(false);
    markAsHandledUserKeyError(error);
    expect(isHandledUserKeyError(error)).toBe(true);
  });

  it.each([
    ["unmarked errors", new Error("some error")],
    ["null", null],
    ["undefined", undefined],
  ])("returns false for %s", (_caseName, error) => {
    expect(isHandledUserKeyError(error)).toBe(false);
  });
});

describe("isOutlookThrottlingError", () => {
  it.each([
    ["ApplicationThrottled code", { code: "ApplicationThrottled" }],
    ["TooManyRequests code", { code: "TooManyRequests" }],
    ["429 status code", { statusCode: 429 }],
    [
      "MailboxConcurrency message",
      { message: "MailboxConcurrency limit exceeded" },
    ],
    [
      "Request limit message",
      { message: "Application is over its Request limit." },
    ],
  ])("detects %s", (_caseName, error) => {
    expect(isOutlookThrottlingError(error)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isOutlookThrottlingError({ code: "NotFound" })).toBe(false);
  });
});

describe("isOutlookAccessDeniedError", () => {
  it.each([
    [
      "Access is denied message with remediation",
      { message: "Access is denied. Check credentials and try again." },
    ],
    ["ErrorAccessDenied code", { code: "ErrorAccessDenied" }],
    [
      "string error with Access is denied remediation",
      "Access is denied. Check credentials and try again.",
    ],
  ])("detects %s", (_caseName, error) => {
    expect(isOutlookAccessDeniedError(error)).toBe(true);
  });

  it.each([
    ["bare 403 status code", { statusCode: 403 }],
    [
      "generic access denied from other providers",
      { message: "Access is denied" },
    ],
    ["unrelated errors", { message: "Not found" }],
  ])("returns false for %s", (_caseName, error) => {
    expect(isOutlookAccessDeniedError(error)).toBe(false);
  });
});

describe("isOutlookItemNotFoundError", () => {
  it.each([
    ["ErrorItemNotFound code", { code: "ErrorItemNotFound" }],
    [
      "store ID message",
      { message: "The store ID provided isn't an ID of an item." },
    ],
    ["ResourceNotFound message", { message: "ResourceNotFound" }],
    [
      "string error with store ID",
      "The store ID provided isn't an ID of an item.",
    ],
  ])("detects %s", (_caseName, error) => {
    expect(isOutlookItemNotFoundError(error)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isOutlookItemNotFoundError({ message: "Access denied" })).toBe(
      false,
    );
  });
});

describe("isKnownOutlookError", () => {
  it.each([
    ["throttling errors", { code: "ApplicationThrottled" }],
    [
      "access denied errors",
      { message: "Access is denied. Check credentials and try again." },
    ],
    ["item not found errors", { code: "ErrorItemNotFound" }],
  ])("detects %s", (_caseName, error) => {
    expect(isKnownOutlookError(error)).toBe(true);
  });

  it("returns false for unknown errors", () => {
    expect(isKnownOutlookError({ message: "Something unexpected" })).toBe(
      false,
    );
  });
});

describe("isKnownApiError", () => {
  it.each([
    [
      "HTTP 402 errors",
      createAPICallError({
        message: "Insufficient credits",
        statusCode: 402,
      }),
      false,
    ],
    [
      "incorrect OpenAI API key errors",
      createAPICallError({
        message: "Incorrect API key provided",
        statusCode: 401,
      }),
      true,
    ],
    [
      "provider rate-limit mode errors",
      Object.assign(new Error("Rate-limit mode active"), {
        name: "ProviderRateLimitModeError",
        provider: "google",
      }),
      true,
    ],
    [
      "LLM content-filter refusals",
      createNoObjectGeneratedError({
        finishReason: "content-filter",
        text: "I'm sorry, but I cannot assist with that request.",
      }),
      true,
    ],
  ])("returns %s for %s", (_caseName, error, expected) => {
    expect(isKnownApiError(error)).toBe(expected);
  });
});

describe("isContentFilterRefusal", () => {
  it("returns true for NoObjectGeneratedError with content-filter finish reason", () => {
    const error = createNoObjectGeneratedError({
      finishReason: "content-filter",
      text: "I'm sorry, but I cannot assist with that request.",
    });

    expect(isContentFilterRefusal(error)).toBe(true);
  });

  it.each([
    [
      "NoObjectGeneratedError with stop finish reason",
      createNoObjectGeneratedError({ finishReason: "stop", text: "not json" }),
    ],
    [
      "NoObjectGeneratedError with length finish reason",
      createNoObjectGeneratedError({
        finishReason: "length",
        text: "truncated",
      }),
    ],
    ["unrelated errors", new Error("boom")],
    ["null", null],
    ["undefined", undefined],
  ])("returns false for %s", (_caseName, error) => {
    expect(isContentFilterRefusal(error)).toBe(false);
  });
});

describe("checkCommonErrors", () => {
  const logger = createScopedLogger("error-test");

  it.each([
    [
      "Gmail",
      createProviderRateLimitError("google"),
      {
        type: "Gmail Rate Limit Exceeded",
        message:
          "Gmail is temporarily limiting requests. Please try again shortly.",
        code: 429,
      },
    ],
    [
      "Outlook",
      createProviderRateLimitError("microsoft"),
      {
        type: "Outlook Rate Limit",
        message:
          "Microsoft is temporarily limiting requests. Please try again shortly.",
        code: 429,
      },
    ],
  ])("maps provider rate-limit mode errors for %s", (_caseName, error, expected) => {
    expect(checkCommonErrors(error, "/api/test", logger)).toEqual(expected);
  });
});

type ActionErrorInput = Parameters<typeof getActionErrorMessage>[0];
type ActionErrorOptions = Parameters<typeof getActionErrorMessage>[1];

function createLlmRepairMetadata() {
  return {
    attempted: true,
    successful: false,
    label: "Categorize sender",
    provider: "openai",
    model: "gpt-test",
    inputLength: 12,
    inputFingerprint: "abc123",
    startsWithQuote: true,
    startsWithBrace: false,
    startsWithBracket: false,
    looksCodeFenced: false,
    candidateKindsTried: ["trimmed", "original"],
  } as const;
}

function createAPICallError({
  message,
  statusCode,
}: {
  message: string;
  statusCode: number;
}): APICallError {
  return new APICallError({
    message,
    url: "https://example.com",
    requestBodyValues: {},
    statusCode,
    responseHeaders: {},
    responseBody: "",
  });
}

function createNoObjectGeneratedError({
  finishReason,
  text,
}: {
  finishReason: "content-filter" | "stop" | "length" | "tool-calls" | "other";
  text: string;
}): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    message: "No object generated: could not parse the response.",
    text,
    response: { id: "id", timestamp: new Date(), modelId: "test" },
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    finishReason,
  });
}

function createProviderRateLimitError(provider: "google" | "microsoft") {
  return Object.assign(new Error("Rate-limit mode active"), {
    name: "ProviderRateLimitModeError",
    provider,
    retryAt: new Date(Date.now() + 60_000).toISOString(),
  });
}
