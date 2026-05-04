import { log } from "next-axiom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "./logger";

const { mockedEnv } = vi.hoisted(() => ({
  mockedEnv: (() => {
    let axiomToken: string | undefined;
    let throwOnAxiomTokenAccess = false;

    return {
      NODE_ENV: "test",
      get AXIOM_TOKEN() {
        if (throwOnAxiomTokenAccess) {
          throw new Error("Attempted to read server token in client context");
        }
        return axiomToken;
      },
      set AXIOM_TOKEN(value: string | undefined) {
        axiomToken = value;
      },
      setThrowOnAxiomTokenAccess(value: boolean) {
        throwOnAxiomTokenAccess = value;
      },
      NEXT_PUBLIC_AXIOM_TOKEN: undefined,
      NEXT_PUBLIC_LOG_SCOPES: undefined,
      ENABLE_DEBUG_LOGS: false,
    };
  })(),
}));

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
  env: mockedEnv,
}));

describe("Logger", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedEnv.NODE_ENV = "test";
    mockedEnv.AXIOM_TOKEN = undefined;
    mockedEnv.setThrowOnAxiomTokenAccess(false);
    mockedEnv.NEXT_PUBLIC_AXIOM_TOKEN = undefined;
    mockedEnv.NEXT_PUBLIC_LOG_SCOPES = undefined;
    mockedEnv.ENABLE_DEBUG_LOGS = false;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("uses Axiom logging when the server token is configured", () => {
    mockedEnv.AXIOM_TOKEN = "server-token";

    const logger = createScopedLogger("test");

    logger.info("Server log", { foo: "bar" });

    expect(log.info).toHaveBeenCalledWith(
      "Server log",
      expect.objectContaining({ scope: "test", foo: "bar" }),
    );
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("logs one serialized production error to Axiom without errorFull", () => {
    mockedEnv.NODE_ENV = "production";
    mockedEnv.AXIOM_TOKEN = "server-token";

    const logger = createScopedLogger("test");
    const error = {
      name: "ProviderError",
      message: "Provider request failed",
      code: "rate_limit_exceeded",
      statusCode: 429,
      requestId: "req_123",
      retriesLeft: 2,
      retryDelay: 500,
      config: {
        url: "https://api.example.test/v1/messages",
        method: "POST",
        retryConfig: {
          currentRetryAttempt: 1,
          statusCodesToRetry: [429, 500],
          totalTimeout: 60_000,
        },
      },
      responseHeaders: {
        "x-request-id": "header_req_123",
        "content-type": "application/json",
        server: "provider",
      },
      cause: {
        code: "ECONNRESET",
        message: "socket hang up",
        socket: {
          bytesRead: 10,
          remoteAddress: "127.0.0.1",
        },
      },
    };

    logger.error("Provider error", { error, operation: "send" });

    expect(log.error).toHaveBeenCalledWith("Provider error", {
      scope: "test",
      operation: "send",
      errorMessage: "Provider request failed",
      error: expect.objectContaining({
        name: "ProviderError",
        message: "Provider request failed",
        code: "rate_limit_exceeded",
        statusCode: 429,
        requestId: "req_123",
        config: expect.objectContaining({
          url: "https://api.example.test/v1/messages",
          method: "POST",
          retryConfig: expect.objectContaining({
            currentRetryAttempt: 1,
          }),
        }),
        cause: expect.objectContaining({
          code: "ECONNRESET",
          message: "socket hang up",
        }),
      }),
    });
    expect(log.error).not.toHaveBeenCalledWith(
      "Provider error",
      expect.objectContaining({ errorFull: expect.anything() }),
    );
  });

  it("uses the serialized production error format for Axiom warnings", () => {
    mockedEnv.NODE_ENV = "production";
    mockedEnv.AXIOM_TOKEN = "server-token";

    const logger = createScopedLogger("test");

    logger.warn("Retrying provider request", {
      error: {
        headers: {
          "x-request-id": "header_req_456",
          server: "provider",
        },
        response: {
          data: {
            error: {
              message: "Rate limited",
              status: 429,
              code: "RESOURCE_EXHAUSTED",
            },
          },
        },
        config: {
          retryConfig: {
            statusCodesToRetry: [429, 500],
          },
        },
      },
    });

    expect(log.warn).toHaveBeenCalledWith("Retrying provider request", {
      scope: "test",
      errorMessage: "Rate limited",
      error: expect.objectContaining({
        response: expect.objectContaining({
          data: {
            error: {
              message: "Rate limited",
              status: 429,
              code: "RESOURCE_EXHAUSTED",
            },
          },
        }),
      }),
    });
  });

  it("does not use Axiom logging when only the public token is configured", () => {
    mockedEnv.NEXT_PUBLIC_AXIOM_TOKEN = "public-token";

    const logger = createScopedLogger("test");

    logger.info("Server log");

    expect(log.info).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it("does not read the server token when used on the client", () => {
    vi.stubGlobal("window", {});
    mockedEnv.setThrowOnAxiomTokenAccess(true);

    expect(() => {
      const logger = createScopedLogger("test");
      logger.info("Client log");
    }).not.toThrow();

    expect(log.info).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
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
