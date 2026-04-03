import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { envMock, processHistoryForUserMock, runWithBackgroundLoggerFlushMock } =
  vi.hoisted(() => ({
    envMock: {
      GOOGLE_PUBSUB_VERIFICATION_TOKEN: "test-google-webhook-token" as
        | string
        | undefined,
    },
    processHistoryForUserMock: vi.fn(),
    runWithBackgroundLoggerFlushMock: vi.fn(),
  }));

vi.mock("@/utils/middleware", () => ({
  withError: (
    scopeOrHandler: string | ((request: Request) => Promise<Response>),
    maybeHandler?: (request: Request) => Promise<Response>,
  ) => {
    if (typeof scopeOrHandler === "string") {
      return maybeHandler as (request: Request) => Promise<Response>;
    }
    return scopeOrHandler;
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/app/api/google/webhook/process-history", () => ({
  processHistoryForUser: (...args: unknown[]) =>
    processHistoryForUserMock(...args),
}));

vi.mock("@/utils/webhook/error-handler", () => ({
  handleWebhookError: vi.fn(),
}));

vi.mock("@/utils/logger-flush", () => ({
  runWithBackgroundLoggerFlush: (...args: unknown[]) =>
    runWithBackgroundLoggerFlushMock(...args),
}));

vi.mock("@/utils/webhook/validate-webhook-account", () => ({
  getWebhookEmailAccount: vi.fn(),
}));

import { POST } from "./route";

describe("Google webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.GOOGLE_PUBSUB_VERIFICATION_TOKEN = "test-google-webhook-token";
    processHistoryForUserMock.mockResolvedValue(undefined);
    runWithBackgroundLoggerFlushMock.mockImplementation(
      ({ task }: { task: () => Promise<void> }) => task(),
    );
  });

  it("fails closed when the verification token is missing", async () => {
    envMock.GOOGLE_PUBSUB_VERIFICATION_TOKEN = undefined;
    const request = createRequest({
      token: "test-google-webhook-token",
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ message: "Google webhook is not configured" });
    expect(processHistoryForUserMock).not.toHaveBeenCalled();
  });

  it("rejects requests with an invalid verification token", async () => {
    const request = createRequest({
      token: "invalid-token",
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ message: "Invalid verification token" });
    expect(processHistoryForUserMock).not.toHaveBeenCalled();
  });

  it("allows requests without a token when verification is intentionally disabled", async () => {
    envMock.GOOGLE_PUBSUB_VERIFICATION_TOKEN = "";
    const request = createRequest({
      emailAddress: "user@example.com",
      historyId: 123,
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(processHistoryForUserMock).toHaveBeenCalledWith(
      { emailAddress: "user@example.com", historyId: 123 },
      {},
      request.logger,
    );
  });

  it("acknowledges valid requests and processes history asynchronously", async () => {
    const request = createRequest({
      token: "test-google-webhook-token",
      emailAddress: "user@example.com",
      historyId: 123,
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(runWithBackgroundLoggerFlushMock).toHaveBeenCalledTimes(1);
    expect(processHistoryForUserMock).toHaveBeenCalledWith(
      { emailAddress: "user@example.com", historyId: 123 },
      {},
      request.logger,
    );
  });
});

function createRequest({
  token,
  emailAddress = "user@example.com",
  historyId = 123,
}: {
  token?: string;
  emailAddress?: string;
  historyId?: number;
}) {
  const requestUrl = new URL("https://example.com/api/google/webhook");
  if (token) requestUrl.searchParams.set("token", token);

  const request = new Request(requestUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        data: Buffer.from(
          JSON.stringify({
            emailAddress,
            historyId,
          }),
        )
          .toString("base64url")
          .replace(/\+/g, "-")
          .replace(/\//g, "_"),
      },
    }),
  }) as Request & {
    logger: {
      error: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
      trace: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      with: ReturnType<typeof vi.fn>;
    };
  };

  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    with: vi.fn(),
  };
  logger.with.mockReturnValue(logger);
  request.logger = logger;

  return request;
}
