import { describe, it, expect, beforeEach, vi } from "vitest";
import { createScopedLogger } from "./logger";

vi.mock("next-axiom", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    NEXT_PUBLIC_AXIOM_TOKEN: undefined,
    NEXT_PUBLIC_LOG_SCOPES: undefined,
    ENABLE_DEBUG_LOGS: false,
  },
}));

describe("Logger", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should serialize simple Error objects", () => {
    const logger = createScopedLogger("test");
    const error = new Error("Something went wrong");

    logger.error("Error occurred", { error });

    const loggedMessage = consoleErrorSpy.mock.calls[0][0];
    expect(loggedMessage).not.toContain("[object Object]");
    expect(loggedMessage).toContain("Something went wrong");
  });

  it("should serialize Error instances as message only", () => {
    const logger = createScopedLogger("test");
    const error = new Error("Custom error") as Error & {
      statusCode: number;
      code: string;
    };
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";

    logger.error("Validation failed", { error });

    const loggedMessage = consoleErrorSpy.mock.calls[0][0];
    expect(loggedMessage).not.toContain("[object Object]");
    expect(loggedMessage).toContain("Custom error");
    // Error instances show only message in console logs (custom properties not shown)
  });

  it("should serialize nested error objects", () => {
    const logger = createScopedLogger("test");
    const error = {
      response: {
        data: {
          error: { code: 500, message: "Internal error" },
        },
      },
    };

    logger.error("Error processing message", { error });

    const loggedMessage = consoleErrorSpy.mock.calls[0][0];
    expect(loggedMessage).not.toContain("[object Object]");
    expect(loggedMessage).toContain("500");
    expect(loggedMessage).toContain("Internal error");
  });

  it("should serialize deeply nested errors", () => {
    const logger = createScopedLogger("test");
    const error = {
      error: {
        response: {
          data: {
            error: {
              code: 404,
              message: "Not found",
              details: { resource: "user", id: "123" },
            },
          },
        },
      },
    };

    logger.error("Resource not found", { error });

    const loggedMessage = consoleErrorSpy.mock.calls[0][0];
    expect(loggedMessage).not.toContain("[object Object]");
    expect(loggedMessage).toContain("404");
    expect(loggedMessage).toContain("Not found");
    expect(loggedMessage).toContain("user");
    expect(loggedMessage).toContain("123");
  });

  it("should serialize arrays of errors", () => {
    const logger = createScopedLogger("test");
    const errors = [
      new Error("Error 1"),
      { message: "Error 2", code: 400 },
      new Error("Error 3"),
    ];

    logger.error("Multiple errors", { errors });

    const loggedMessage = consoleErrorSpy.mock.calls[0][0];
    expect(loggedMessage).not.toContain("[object Object]");
    expect(loggedMessage).toContain("Error 1");
    expect(loggedMessage).toContain("Error 2");
    expect(loggedMessage).toContain("Error 3");
    expect(loggedMessage).toContain("400");
  });

  it("should serialize axios-like error structure", () => {
    const logger = createScopedLogger("test");
    const error = {
      response: {
        status: 401,
        data: {
          error: "Unauthorized",
          message: "Invalid token",
        },
      },
      config: {
        url: "/api/endpoint",
        method: "POST",
      },
    };

    logger.error("API request failed", { error });

    const loggedMessage = consoleErrorSpy.mock.calls[0][0];
    expect(loggedMessage).not.toContain("[object Object]");
    expect(loggedMessage).toContain("401");
    expect(loggedMessage).toContain("Unauthorized");
    expect(loggedMessage).toContain("Invalid token");
    expect(loggedMessage).toContain("/api/endpoint");
  });

  it("should handle complex nested error objects without [object Object]", () => {
    const logger = createScopedLogger("test");

    // Complex error like Gmail API error
    const complexError = {
      error: {
        response: {
          data: {
            error: {
              code: 404,
              message: "Requested entity was not found.",
              status: "NOT_FOUND",
            },
          },
        },
        code: 404,
        message: "Requested entity was not found.",
      },
      attemptNumber: 1,
      retriesLeft: 5,
    };

    logger.error("Error finding draft", { error: complexError });

    const loggedMessage = consoleErrorSpy.mock.calls[0][0];

    // Should not have [object Object]
    expect(loggedMessage).not.toContain("[object Object]");

    // Should contain important details
    expect(loggedMessage).toContain("404");
    expect(loggedMessage).toContain("Requested entity was not found");
    expect(loggedMessage).toContain("attemptNumber");
    expect(loggedMessage).toContain("retriesLeft");
  });
});
