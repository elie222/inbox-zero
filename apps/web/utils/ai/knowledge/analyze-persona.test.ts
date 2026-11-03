import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { getEmailAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { schedulePersonaAnalysis } from "@/utils/ai/knowledge/analyze-persona";
import {
  aiAnalyzePersona,
  type PersonaAnalysis,
} from "@/utils/ai/knowledge/persona";
import { scheduleAccountAnalysis } from "@/utils/ai/knowledge/schedule-account-analysis";
import { createEmailProvider } from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";

vi.mock("@/utils/prisma");
vi.mock("@/utils/ai/knowledge/persona", () => ({ aiAnalyzePersona: vi.fn() }));
vi.mock("@/utils/ai/knowledge/schedule-account-analysis", () => ({
  scheduleAccountAnalysis: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAiAndTokens: vi.fn(),
}));

const logger = createScopedLogger("analyze-persona-test");
const analysis: PersonaAnalysis = {
  persona: "Engineer",
  industry: "Software",
  positionLevel: "mid",
  responsibilities: ["Develop software"],
  confidence: "medium",
  reasoning: "Discusses software development",
};

describe("schedulePersonaAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scheduleAccountAnalysis).mockResolvedValue({ status: "running" });
    vi.mocked(getEmailAccountWithAiAndTokens).mockResolvedValue({
      ...getEmailAccount({ email: "user@example.com" }),
      account: {
        provider: "google",
        access_token: null,
        refresh_token: null,
        expires_at: null,
      },
      tokens: { access_token: null, refresh_token: null, expires_at: null },
    });
    const messages = [message("sent", "user@example.com")];
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getSentMessages: vi.fn().mockResolvedValue(messages),
        getMessagesWithPagination: vi.fn().mockResolvedValue({ messages }),
      }),
    );
    vi.mocked(aiAnalyzePersona).mockResolvedValue(analysis);
  });

  it("preserves a newer analysis written after the ownership check", async () => {
    let stored: PersonaAnalysis | null = null;
    prisma.emailAccount.update.mockImplementation(async ({ data }) => {
      stored = data.personaAnalysis as PersonaAnalysis;
      return {} as never;
    });
    prisma.emailAccount.updateMany.mockImplementation(
      async ({ where, data }) => {
        expect(where).toEqual({
          id: "account-id",
          personaAnalysis: { equals: Prisma.DbNull },
        });
        if (stored !== null) return { count: 0 };
        stored = data.personaAnalysis as PersonaAnalysis;
        return { count: 1 };
      },
    );
    const run = await scheduledRun();
    const newerAnalysis = { ...analysis, persona: "Product Manager" };

    const completed = await run(async () => {
      // The old worker's successful lock read races with a newer worker's write.
      stored = newerAnalysis;
      return true;
    });

    expect(stored).toEqual(newerAnalysis);
    expect(completed).toBe(false);
  });

  it("completes when the persona is still unset", async () => {
    prisma.emailAccount.updateMany.mockResolvedValue({ count: 1 });
    const run = await scheduledRun();
    expect(await run(async () => true)).toBe(true);
  });

  it("does not persist after losing lock ownership", async () => {
    const run = await scheduledRun();
    expect(await run(async () => false)).toBe(false);
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    expect(prisma.emailAccount.updateMany).not.toHaveBeenCalled();
  });

  it("analyzes only sent messages rather than received mail", async () => {
    const sent = message("sent", "user@example.com");
    const received = message("received", "sender@example.com");
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getSentMessages: vi.fn().mockResolvedValue([sent]),
        getMessagesWithPagination: vi
          .fn()
          .mockResolvedValue({ messages: [received, sent] }),
      }),
    );
    prisma.emailAccount.updateMany.mockResolvedValue({ count: 1 });
    const run = await scheduledRun();

    await run(async () => true);

    expect(vi.mocked(aiAnalyzePersona).mock.calls[0][0].emails).toEqual([
      expect.objectContaining({ id: "sent", from: "user@example.com" }),
    ]);
  });
});

async function scheduledRun() {
  await schedulePersonaAnalysis({
    emailAccountId: "account-id",
    provider: "google",
    logger,
  });
  return vi.mocked(scheduleAccountAnalysis).mock.calls[0][0].run;
}

function message(id: string, from: string): ParsedMessage {
  return {
    id,
    threadId: id,
    historyId: id,
    date: "2026-01-01",
    internalDate: "1767225600000",
    subject: "Project update",
    inline: [],
    snippet: "Project update",
    textPlain: "We finished the software release.",
    headers: {
      from,
      to: "recipient@example.com",
      subject: "Project update",
      date: "2026-01-01",
    },
  };
}
