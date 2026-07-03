import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, captureExceptionMock, reconcileMock } = vi.hoisted(() => ({
  envMock: {
    CRON_SECRET: "cron-secret",
  },
  captureExceptionMock: vi.fn(),
  reconcileMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/utils/email/email-message-stats-reconciliation", () => ({
  reconcileConfiguredGmailEmailMessageStats: (...args: unknown[]) =>
    reconcileMock(...args),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET, POST } from "./route";

describe("email message stats reconciliation cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CRON_SECRET = "cron-secret";
    reconcileMock.mockResolvedValue({
      dryRun: false,
      accountsChecked: 1,
      accountsSkipped: 0,
      failedAccounts: 0,
      totals: { checked: 1 },
      accounts: [],
    });
  });

  it("rejects GET requests without the cron bearer token", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/api/cron/email-message-stats-reconciliation",
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(reconcileMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("runs GET reconciliation with parsed query options", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/api/cron/email-message-stats-reconciliation?dryRun=true&emailAccountId=account-1&batchSize=5&accountLimit=2&sampleLimit=3&maxErrorsPerAccount=4",
        {
          headers: { authorization: "Bearer cron-secret" },
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accountsChecked: 1,
    });
    expect(reconcileMock).toHaveBeenCalledWith({
      logger: expect.anything(),
      dryRun: true,
      emailAccountId: "account-1",
      accountLimit: 2,
      batchSize: 5,
      sampleLimit: 3,
      maxErrorsPerAccount: 4,
    });
  });

  it("uses defaults for blank GET numeric options", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/api/cron/email-message-stats-reconciliation?batchSize=&accountLimit=&sampleLimit=&maxErrorsPerAccount=",
        {
          headers: { authorization: "Bearer cron-secret" },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(reconcileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountLimit: 10,
        batchSize: 25,
        sampleLimit: 20,
        maxErrorsPerAccount: 5,
      }),
    );
  });

  it("rejects POST requests without the cron secret in the body", async () => {
    const response = await POST(
      new Request(
        "http://localhost:3000/api/cron/email-message-stats-reconciliation",
        {
          method: "POST",
          body: JSON.stringify({ CRON_SECRET: "wrong-secret" }),
        },
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(reconcileMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("runs POST reconciliation with parsed body options", async () => {
    const response = await POST(
      new Request(
        "http://localhost:3000/api/cron/email-message-stats-reconciliation",
        {
          method: "POST",
          body: JSON.stringify({
            CRON_SECRET: "cron-secret",
            dryRun: true,
            emailAccountId: "account-1",
            batchSize: 5,
          }),
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(reconcileMock).toHaveBeenCalledWith({
      logger: expect.anything(),
      dryRun: true,
      emailAccountId: "account-1",
      accountLimit: 10,
      batchSize: 5,
      sampleLimit: 20,
      maxErrorsPerAccount: 5,
    });
  });
});
