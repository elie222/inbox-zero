import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { analyzePersonaAction } from "./email-account";
import { getMockMessage } from "@/__tests__/helpers";
import { analyzeWritingStyleAction, assessAction } from "./assess";

const mocks = vi.hoisted(() => ({
  after: [] as (() => void | Promise<void>)[],
  getMessages: vi.fn(),
  getSentMessages: vi.fn(),
  createProvider: vi.fn(),
  analyzeStyle: vi.fn(),
  analyze: vi.fn(),
  getAccount: vi.fn(),
  locks: new Map<string, { value: string; expires: number }>(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: async () => ({ user: { id: "user-1", email: "user@example.com" } }),
}));
vi.mock("@sentry/nextjs", () => import("@/__tests__/mocks/sentry-nextjs.mock"));
vi.mock("next/server", async (importActual) => ({
  ...(await importActual<typeof import("next/server")>()),
  after: (callback: () => void | Promise<void>) => mocks.after.push(callback),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mocks.createProvider,
}));
vi.mock("@/utils/ai/knowledge/writing-style", () => ({
  aiAnalyzeWritingStyle: mocks.analyzeStyle,
}));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAiAndTokens: mocks.getAccount,
}));
vi.mock("@/utils/ai/knowledge/persona", () => ({
  aiAnalyzePersona: mocks.analyze,
}));
vi.mock("@/utils/redis", () => ({
  redis: {
    get: async (key: string) => {
      const value = mocks.locks.get(key);
      return value && value.expires > Date.now() ? value.value : null;
    },
    set: async (
      key: string,
      value: string,
      options: { nx?: boolean; ex: number },
    ) => {
      const current = mocks.locks.get(key);
      if (options.nx && current && current.expires > Date.now()) return null;
      mocks.locks.set(key, { value, expires: Date.now() + options.ex * 1000 });
      return "OK";
    },
    eval: async (_script: string, keys: string[], args: string[]) => {
      const current = mocks.locks.get(keys[0]);
      if (
        !current ||
        current.value !== args[0] ||
        current.expires <= Date.now()
      )
        return 0;
      if (args.length === 1) mocks.locks.delete(keys[0]);
      else
        mocks.locks.set(keys[0], {
          value: args[1],
          expires: Date.now() + Number(args[2]) * 1000,
        });
      return 1;
    },
  },
}));

const persona = {
  persona: "Founder",
  industry: "Software",
  positionLevel: "executive",
  responsibilities: ["Product"],
  confidence: "medium",
  reasoning: "Product discussions",
};

describe("background persona scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.after.length = 0;
    mocks.locks.clear();
    prisma.emailAccount.findUnique.mockImplementation(async (args) => {
      if (args.select?.account) {
        return {
          email: "user@example.com",
          account: { userId: "user-1", provider: "google" },
        } as never;
      }
      return {
        id: "account-1",
        user: {},
        personaAnalysis: null,
        behaviorProfile: null,
        writingStyle: null,
      } as never;
    });
    prisma.emailAccount.update.mockResolvedValue({ id: "account-1" } as never);
    mocks.getAccount.mockResolvedValue({ id: "account-1", user: {} });
    mocks.getMessages.mockResolvedValue({ messages: [] });
    mocks.getSentMessages.mockResolvedValue([]);
    mocks.createProvider.mockResolvedValue({
      name: "google",
      getMessagesWithPagination: mocks.getMessages,
      getSentMessages: mocks.getSentMessages,
      getLabelById: async () => ({}),
      getLabels: async () => [],
      getFiltersList: async () => [],
      getForwardingAddresses: async () => [],
    });
    mocks.analyzeStyle.mockResolvedValue({
      typicalLength: "Short",
      formality: "Informal",
      commonGreeting: "Hello",
      notableTraits: [],
      examples: [],
    });
    mocks.analyze.mockResolvedValue(persona);
  });

  it("responds before starting an unresolved provider read", async () => {
    mocks.getMessages.mockReturnValue(new Promise(() => {}));

    const result = await Promise.race([
      analyzePersonaAction("account-1"),
      new Promise<"blocked">((resolve) =>
        setTimeout(() => resolve("blocked"), 100),
      ),
    ]);

    expect(result).not.toBe("blocked");
    expect(result).toMatchObject({ data: { status: "running" } });
    expect(mocks.getMessages).not.toHaveBeenCalled();
  });

  it("reuses cached analysis without provider or LLM requests", async () => {
    prisma.emailAccount.findUnique.mockImplementation(async (args) => {
      if (args.select?.account) {
        return {
          email: "user@example.com",
          account: { userId: "user-1", provider: "google" },
        } as never;
      }
      return { personaAnalysis: persona } as never;
    });

    expect(await analyzePersonaAction("account-1")).toMatchObject({
      data: { status: "completed" },
    });
    await drainAfter();
    expect(mocks.getMessages).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("deduplicates an account but schedules other accounts independently", async () => {
    await analyzePersonaAction("account-1");
    await analyzePersonaAction("account-1");
    await analyzePersonaAction("account-2");
    await drainAfter();

    expect(mocks.getMessages).toHaveBeenCalledTimes(2);
    expect(mocks.getMessages).toHaveBeenNthCalledWith(1, { maxResults: 200 });
  });

  it("cools down after throttling and allows another attempt after expiry", async () => {
    vi.useFakeTimers();
    mocks.getMessages.mockRejectedValue(
      Object.assign(new Error("Quota exceeded"), {
        code: 403,
        errors: [{ reason: "rateLimitExceeded" }],
      }),
    );
    await analyzePersonaAction("account-1");
    await drainAfter();

    expect(await analyzePersonaAction("account-1")).toMatchObject({
      data: { status: "cooldown" },
    });
    await drainAfter();
    expect(mocks.getMessages).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_001);
    await analyzePersonaAction("account-1");
    await drainAfter();
    expect(mocks.getMessages).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not invoke the LLM or write a fabricated persona for an empty mailbox", async () => {
    expect(await analyzePersonaAction("account-1")).toMatchObject({
      data: { status: "running" },
    });
    await drainAfter();

    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    expect(await analyzePersonaAction("account-1")).toMatchObject({
      data: { status: "cooldown" },
    });
  });

  it("persists completed analysis after the response", async () => {
    mocks.getMessages.mockResolvedValue({ messages: [getMockMessage()] });

    expect(await analyzePersonaAction("account-1")).toMatchObject({
      data: { status: "running" },
    });
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    await drainAfter();

    expect(mocks.getMessages).toHaveBeenCalledWith({ maxResults: 200 });
    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "account-1" },
      data: { personaAnalysis: persona },
    });
  });

  it("recovers when a worker disappears and its processing lock expires", async () => {
    vi.useFakeTimers();
    await analyzePersonaAction("account-1");
    mocks.after.length = 0;
    await vi.advanceTimersByTimeAsync(300_001);

    expect(await analyzePersonaAction("account-1")).toMatchObject({
      data: { status: "running" },
    });
    await drainAfter();
    expect(mocks.getMessages).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not let an expired task overwrite the result owned by a newer task", async () => {
    vi.useFakeTimers();
    mocks.getMessages.mockResolvedValue({ messages: [getMockMessage()] });
    await analyzePersonaAction("account-1");
    const oldCallbacks = mocks.after.splice(0);
    await vi.advanceTimersByTimeAsync(300_001);
    await analyzePersonaAction("account-1");

    for (const callback of oldCallbacks) await callback();
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    await drainAfter();
    expect(prisma.emailAccount.update).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it.each([
    assessAction,
    analyzeWritingStyleAction,
  ])("defers other startup analysis until after its response", async (action) => {
    mocks.getSentMessages.mockReturnValue(new Promise(() => {}));
    const result = await Promise.race([
      action("account-1"),
      new Promise<"blocked">((resolve) =>
        setTimeout(() => resolve("blocked"), 100),
      ),
    ]);
    expect(result).not.toBe("blocked");
    expect(result).toMatchObject({ data: { status: "running" } });
    expect(mocks.createProvider).not.toHaveBeenCalled();
  });

  it("does not initialize a provider for a cached mailbox assessment", async () => {
    prisma.emailAccount.findUnique.mockImplementation(async (args) => {
      if (args.select?.account)
        return {
          email: "user@example.com",
          account: { userId: "user-1", provider: "google" },
        } as never;
      return { behaviorProfile: {} } as never;
    });
    await assessAction("account-1");
    await drainAfter();
    expect(mocks.createProvider).not.toHaveBeenCalled();
  });

  it.each([
    assessAction,
    analyzeWritingStyleAction,
  ])("persists other startup analysis after responding", async (action) => {
    mocks.getSentMessages.mockResolvedValue([getMockMessage()]);
    expect(await action("account-1")).toMatchObject({
      data: { status: "running" },
    });
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    await drainAfter();
    expect(prisma.emailAccount.update).toHaveBeenCalledOnce();
  });

  it.each([
    assessAction,
    analyzeWritingStyleAction,
  ])("does not persist incomplete analysis when the sample is throttled", async (action) => {
    mocks.getSentMessages.mockRejectedValue(
      Object.assign(new Error("Quota exceeded"), {
        code: 403,
        errors: [{ reason: "rateLimitExceeded" }],
      }),
    );
    await action("account-1");
    await drainAfter();
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    expect(await action("account-1")).toMatchObject({
      data: { status: "cooldown" },
    });
  });
});

async function drainAfter() {
  while (mocks.after.length) await mocks.after.shift()!();
}
