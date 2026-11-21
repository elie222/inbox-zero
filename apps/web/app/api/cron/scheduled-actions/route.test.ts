import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  envMock,
  captureExceptionMock,
  processDueSnoozedThreadsMock,
  processDueScheduledEmailsMock,
  executeScheduledActionMock,
  markQStashActionAsExecutingMock,
  createEmailProviderMock,
} = vi.hoisted(() => ({
  envMock: {
    CRON_SECRET: "cron-secret",
    QSTASH_TOKEN: "",
  },
  captureExceptionMock: vi.fn(),
  processDueSnoozedThreadsMock: vi.fn(),
  processDueScheduledEmailsMock: vi.fn(),
  executeScheduledActionMock: vi.fn(),
  markQStashActionAsExecutingMock: vi.fn(),
  createEmailProviderMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/prisma");
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/utils/snooze/process-due", () => ({
  processDueSnoozedThreads: () => processDueSnoozedThreadsMock(),
}));

vi.mock("@/utils/scheduled-email/service", () => ({
  processDueScheduledEmails: () => processDueScheduledEmailsMock(),
}));

vi.mock("@/utils/scheduled-actions/scheduler", () => ({
  markQStashActionAsExecuting: (id: string) =>
    markQStashActionAsExecutingMock(id),
}));

vi.mock("@/utils/scheduled-actions/executor", () => ({
  executeScheduledAction: (...args: unknown[]) =>
    executeScheduledActionMock(...args),
  checkAndCompleteExecutedRule: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: unknown[]) => createEmailProviderMock(...args),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET, POST } from "./route";

describe("scheduled actions cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CRON_SECRET = "cron-secret";
    envMock.QSTASH_TOKEN = "";

    processDueSnoozedThreadsMock.mockResolvedValue({
      processed: 1,
      failed: 0,
      skipped: 0,
      total: 1,
    });
    processDueScheduledEmailsMock.mockResolvedValue({
      processed: 2,
      failed: 0,
      skipped: 0,
      total: 2,
    });
    prisma.scheduledAction.findMany.mockResolvedValue([]);
  });

  it("rejects unauthorized GET requests", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/scheduled-actions"),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthorized POST requests", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/cron/scheduled-actions", {
        method: "POST",
        body: JSON.stringify({ CRON_SECRET: "wrong-secret" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("processes scheduled actions, snoozed threads, and scheduled emails", async () => {
    const action = {
      id: "action-1",
      emailAccountId: "acc-1",
      executedRuleId: "rule-1",
      emailAccount: {
        account: { provider: "google" },
      },
    };
    prisma.scheduledAction.findMany.mockResolvedValue([action] as any);
    markQStashActionAsExecutingMock.mockResolvedValue(true);
    createEmailProviderMock.mockResolvedValue({});
    executeScheduledActionMock.mockResolvedValue({ success: true });

    const response = await GET(
      new Request("http://localhost:3000/api/cron/scheduled-actions", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.scheduledActions).toEqual({
      processed: 1,
      failed: 0,
      skipped: 0,
      total: 1,
    });
    expect(json.snoozedThreads).toEqual({
      processed: 1,
      failed: 0,
      skipped: 0,
      total: 1,
    });
    expect(json.scheduledEmails).toEqual({
      processed: 2,
      failed: 0,
      skipped: 0,
      total: 2,
    });
  });

  it("processes scheduled actions even when QSTASH_TOKEN is configured (fallback)", async () => {
    envMock.QSTASH_TOKEN = "qstash-token";

    const action = {
      id: "action-fallback",
      emailAccountId: "acc-1",
      executedRuleId: "rule-1",
      emailAccount: {
        account: { provider: "google" },
      },
    };
    prisma.scheduledAction.findMany.mockResolvedValue([action] as any);
    markQStashActionAsExecutingMock.mockResolvedValue(true);
    createEmailProviderMock.mockResolvedValue({});
    executeScheduledActionMock.mockResolvedValue({ success: true });

    const response = await GET(
      new Request("http://localhost:3000/api/cron/scheduled-actions", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    // Fallback must execute scheduled actions rather than returning { skipped: true, reason: "qstash-configured" }
    expect(json.scheduledActions).toEqual({
      processed: 1,
      failed: 0,
      skipped: 0,
      total: 1,
    });
  });
});
