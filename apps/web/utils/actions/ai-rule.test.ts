import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  createEmailProviderMock,
  flushLoggerSafelyMock,
  getEmailAccountForRuleExecutionMock,
  runRulesMock,
} = vi.hoisted(() => ({
  createEmailProviderMock: vi.fn(),
  flushLoggerSafelyMock: vi.fn(),
  getEmailAccountForRuleExecutionMock: vi.fn(),
  runRulesMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createEmailProviderMock,
}));
vi.mock("@/utils/logger-flush", () => ({
  flushLoggerSafely: flushLoggerSafelyMock,
}));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountForRuleExecution: getEmailAccountForRuleExecutionMock,
}));
vi.mock("@/utils/ai/choose-rule/run-rules", () => ({
  runRules: runRulesMock,
}));

import {
  runRulesAction,
  testAiCustomContentAction,
} from "@/utils/actions/ai-rule";

describe("runRulesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);

    prisma.executedRule.findMany.mockResolvedValue([] as any);
    prisma.rule.findMany.mockResolvedValue([] as any);

    getEmailAccountForRuleExecutionMock.mockResolvedValue({
      id: "account-1",
      email: "user@example.com",
      user: {},
      account: { provider: "google" },
    });

    createEmailProviderMock.mockResolvedValue({
      getMessage: vi.fn(async () => ({
        id: "message-1",
        threadId: "thread-1",
      })),
    });

    runRulesMock.mockResolvedValue([
      {
        rule: null,
        reason: "No rules matched",
        status: "SKIPPED",
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
      },
    ]);

    flushLoggerSafelyMock.mockResolvedValue(undefined);
  });

  it("waits for logger flush before resolving test-mode runs", async () => {
    const pendingResolves: Array<() => void> = [];
    flushLoggerSafelyMock.mockImplementation(
      async (_logger, extra?: { flushReason?: string }) => {
        if (extra?.flushReason !== "test-mode") return;

        await new Promise<void>((resolve) => {
          pendingResolves.push(resolve);
        });
      },
    );

    let settled = false;
    const actionPromise = runRulesAction("account-1", {
      messageId: "message-1",
      threadId: "thread-1",
      isTest: true,
    }).then((result) => {
      settled = true;
      return result;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runRulesMock).toHaveBeenCalledTimes(1);
    expect(flushLoggerSafelyMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "runRules",
        flushReason: "test-mode",
      }),
    );
    expect(settled).toBe(false);

    for (const resolve of pendingResolves) resolve();

    const result = await actionPromise;

    expect(result?.data).toHaveLength(1);
    expect(settled).toBe(true);
  });

  it("does not flush logger for non-test runs", async () => {
    const result = await runRulesAction("account-1", {
      messageId: "message-1",
      threadId: "thread-1",
      isTest: false,
    });

    expect(result?.data).toHaveLength(1);
    expect(flushLoggerSafelyMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "runRules",
        flushReason: "test-mode",
      }),
    );
  });

  it("passes the request-scoped logger into rule execution", async () => {
    const result = await runRulesAction("account-1", {
      messageId: "message-1",
      threadId: "thread-1",
      isTest: true,
    });

    expect(result?.data).toHaveLength(1);
    expect(runRulesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        logger: expect.objectContaining({
          info: expect.any(Function),
          warn: expect.any(Function),
          error: expect.any(Function),
          trace: expect.any(Function),
          with: expect.any(Function),
          flush: expect.any(Function),
        }),
      }),
    );

    expect(flushLoggerSafelyMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "runRules",
        flushReason: "test-mode",
      }),
    );
  });
});

describe("testAiCustomContentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);

    prisma.rule.findMany.mockResolvedValue([] as any);

    getEmailAccountForRuleExecutionMock.mockResolvedValue({
      id: "account-1",
      email: "user@example.com",
      user: {},
      account: { provider: "google" },
    });

    createEmailProviderMock.mockResolvedValue({});

    runRulesMock.mockResolvedValue([
      {
        rule: null,
        reason: "No rules matched",
        status: "SKIPPED",
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
      },
    ]);

    flushLoggerSafelyMock.mockResolvedValue(undefined);
  });

  it("passes a synthetic message whose id matches threadId so Gmail reply detection treats it as thread root", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    await testAiCustomContentAction("account-1", { content: "custom body" });

    expect(runRulesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isTest: true,
        message: expect.objectContaining({
          id: "testMessageId-1700000000000",
          threadId: "testMessageId-1700000000000",
          textPlain: "custom body",
        }),
      }),
    );

    nowSpy.mockRestore();
  });

  it("flushes logs after a custom content test run", async () => {
    await testAiCustomContentAction("account-1", { content: "x" });

    expect(flushLoggerSafelyMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "testAiCustomContent",
        flushReason: "test-mode",
      }),
    );
  });
});
