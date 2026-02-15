import { describe, it, expect } from "vitest";
import { APICallError } from "ai";
import {
  getActionErrorMessage,
  isInsufficientCreditsError,
  isHandledUserKeyError,
  isKnownApiError,
  isKnownOutlookError,
  isOutlookAccessDeniedError,
  isOutlookItemNotFoundError,
  isOutlookThrottlingError,
  markAsHandledUserKeyError,
} from "./error";

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

describe("getActionErrorMessage", () => {
  it("returns serverError when present", () => {
    const result = getActionErrorMessage({
      serverError: "Database connection failed",
    });

    expect(result).toBe("Database connection failed");
  });

  // This test uses the REAL flattened shape that next-safe-action returns
  // when defaultValidationErrorsShape: "flattened" is configured
  it("returns validation errors from flattened validationErrors shape", () => {
    const result = getActionErrorMessage({
      validationErrors: {
        formErrors: ["Form is invalid"],
        fieldErrors: {
          email: ["Email is required"],
          password: ["Password too short"],
        },
      } as any,
    });

    expect(result).toBe(
      "Form is invalid. Email is required. Password too short",
    );
  });

  it("returns only field errors when no form errors (flattened shape)", () => {
    const result = getActionErrorMessage({
      validationErrors: {
        formErrors: [],
        fieldErrors: {
          name: ["Name must be at least 10 characters"],
        },
      } as any,
    });

    expect(result).toBe("Name must be at least 10 characters");
  });

  it("returns bindArgsValidationErrors when validationErrors is empty (flattened shape)", () => {
    const result = getActionErrorMessage({
      validationErrors: {
        formErrors: [],
        fieldErrors: {},
      } as any,
      bindArgsValidationErrors: [
        {
          formErrors: ["Invalid account ID"],
          fieldErrors: {},
        } as any,
      ],
    });

    expect(result).toBe("Invalid account ID");
  });

  it("skips empty bindArgsValidationErrors entries (flattened shape)", () => {
    const result = getActionErrorMessage({
      bindArgsValidationErrors: [
        undefined as any,
        {
          formErrors: [],
          fieldErrors: {},
        } as any,
        {
          formErrors: ["Third entry error"],
          fieldErrors: {},
        } as any,
      ],
    });

    expect(result).toBe("Third entry error");
  });

  it("returns fallback when no errors present", () => {
    const result = getActionErrorMessage({});

    expect(result).toBe("An unknown error occurred");
  });

  it("returns custom fallback when provided", () => {
    const result = getActionErrorMessage({}, "Something went wrong");

    expect(result).toBe("Something went wrong");
  });

  it("prioritizes serverError over validation errors (flattened shape)", () => {
    const result = getActionErrorMessage({
      serverError: "Server error",
      validationErrors: {
        formErrors: ["Validation error"],
        fieldErrors: {},
      } as any,
    });

    expect(result).toBe("Server error");
  });

  it("prioritizes validationErrors over bindArgsValidationErrors (flattened shape)", () => {
    const result = getActionErrorMessage({
      validationErrors: {
        formErrors: ["Input validation error"],
        fieldErrors: {},
      } as any,
      bindArgsValidationErrors: [
        {
          formErrors: ["Bind args error"],
          fieldErrors: {},
        } as any,
      ],
    });

    expect(result).toBe("Input validation error");
  });

  describe("with prefix option", () => {
    it("prepends prefix to error message", () => {
      const result = getActionErrorMessage(
        { serverError: "Invalid input" },
        { prefix: "Failed to save" },
      );

      expect(result).toBe("Failed to save. Invalid input");
    });

    it("returns only prefix when no error message", () => {
      const result = getActionErrorMessage({}, { prefix: "Failed to save" });

      expect(result).toBe("Failed to save");
    });

    it("prepends prefix to validation errors", () => {
      const result = getActionErrorMessage(
        {
          validationErrors: {
            formErrors: [],
            fieldErrors: { name: ["Name is required"] },
          } as any,
        },
        { prefix: "Failed to update user" },
      );

      expect(result).toBe("Failed to update user. Name is required");
    });

    it("uses custom fallback with prefix when no error", () => {
      const result = getActionErrorMessage(
        {},
        { prefix: "Failed to save", fallback: "Please try again" },
      );

      expect(result).toBe("Failed to save");
    });

    it("uses fallback when no prefix and no error", () => {
      const result = getActionErrorMessage(
        {},
        { fallback: "Custom fallback message" },
      );

      expect(result).toBe("Custom fallback message");
    });
  });
});

describe("isInsufficientCreditsError", () => {
  it("returns true for HTTP 402 status code", () => {
    const error = createAPICallError({
      message: "Insufficient credits",
      statusCode: 402,
    });
    expect(isInsufficientCreditsError(error)).toBe(true);
  });

  it("returns false for other status codes", () => {
    const error = createAPICallError({
      message: "Rate limit exceeded",
      statusCode: 429,
    });
    expect(isInsufficientCreditsError(error)).toBe(false);
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

  it("returns false for unmarked errors", () => {
    const error = new Error("some error");
    expect(isHandledUserKeyError(error)).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isHandledUserKeyError(null)).toBe(false);
    expect(isHandledUserKeyError(undefined)).toBe(false);
  });
});

describe("isOutlookThrottlingError", () => {
  it("detects ApplicationThrottled code", () => {
    expect(isOutlookThrottlingError({ code: "ApplicationThrottled" })).toBe(
      true,
    );
  });

  it("detects TooManyRequests code", () => {
    expect(isOutlookThrottlingError({ code: "TooManyRequests" })).toBe(true);
  });

  it("detects 429 status code", () => {
    expect(isOutlookThrottlingError({ statusCode: 429 })).toBe(true);
  });

  it("detects MailboxConcurrency message", () => {
    expect(
      isOutlookThrottlingError({
        message: "MailboxConcurrency limit exceeded",
      }),
    ).toBe(true);
  });

  it("detects Request limit message", () => {
    expect(
      isOutlookThrottlingError({
        message: "Application is over its Request limit.",
      }),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isOutlookThrottlingError({ code: "NotFound" })).toBe(false);
  });
});

describe("isOutlookAccessDeniedError", () => {
  it("detects Access is denied message", () => {
    expect(
      isOutlookAccessDeniedError({
        message: "Access is denied. Check credentials and try again.",
      }),
    ).toBe(true);
  });

  it("detects ErrorAccessDenied code", () => {
    expect(isOutlookAccessDeniedError({ code: "ErrorAccessDenied" })).toBe(
      true,
    );
  });

  it("does not match bare 403 status code (could be app misconfiguration)", () => {
    expect(isOutlookAccessDeniedError({ statusCode: 403 })).toBe(false);
  });

  it("detects string error with Access is denied", () => {
    expect(
      isOutlookAccessDeniedError(
        "Access is denied. Check credentials and try again.",
      ),
    ).toBe(true);
  });

  it("does not match generic access denied from other providers", () => {
    expect(
      isOutlookAccessDeniedError({ message: "Access is denied" }),
    ).toBe(false);
  });

  it("returns false for unrelated errors", () => {
    expect(isOutlookAccessDeniedError({ message: "Not found" })).toBe(false);
  });
});

describe("isOutlookItemNotFoundError", () => {
  it("detects ErrorItemNotFound code", () => {
    expect(isOutlookItemNotFoundError({ code: "ErrorItemNotFound" })).toBe(
      true,
    );
  });

  it("detects store ID message", () => {
    expect(
      isOutlookItemNotFoundError({
        message: "The store ID provided isn't an ID of an item.",
      }),
    ).toBe(true);
  });

  it("detects ResourceNotFound message", () => {
    expect(
      isOutlookItemNotFoundError({ message: "ResourceNotFound" }),
    ).toBe(true);
  });

  it("detects string error with store ID", () => {
    expect(
      isOutlookItemNotFoundError(
        "The store ID provided isn't an ID of an item.",
      ),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isOutlookItemNotFoundError({ message: "Access denied" })).toBe(
      false,
    );
  });
});

describe("isKnownOutlookError", () => {
  it("detects throttling errors", () => {
    expect(isKnownOutlookError({ code: "ApplicationThrottled" })).toBe(true);
  });

  it("detects access denied errors", () => {
    expect(
      isKnownOutlookError({
        message: "Access is denied. Check credentials and try again.",
      }),
    ).toBe(true);
  });

  it("detects item not found errors", () => {
    expect(isKnownOutlookError({ code: "ErrorItemNotFound" })).toBe(true);
  });

  it("returns false for unknown errors", () => {
    expect(isKnownOutlookError({ message: "Something unexpected" })).toBe(
      false,
    );
  });
});

describe("isKnownApiError", () => {
  it("does not treat 402 as a known API error", () => {
    const error = createAPICallError({
      message: "Insufficient credits",
      statusCode: 402,
    });
    expect(isKnownApiError(error)).toBe(false);
  });

  it("treats incorrect OpenAI API key as a known error", () => {
    const error = createAPICallError({
      message: "Incorrect API key provided",
      statusCode: 401,
    });
    expect(isKnownApiError(error)).toBe(true);
  });
});
