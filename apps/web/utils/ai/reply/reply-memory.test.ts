import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
  ReplyMemoryStatus,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  aiExtractReplyMemoriesFromDraftEdit,
  getReplyMemoryContent,
  isMeaningfulDraftEdit,
  syncReplyMemoriesFromEvidence,
} from "./reply-memory";

const { mockCreateGenerateObject, mockGenerateObject } = vi.hoisted(() => {
  const mockGenerateObject = vi.fn();
  const mockCreateGenerateObject = vi.fn(() => mockGenerateObject);
  return { mockCreateGenerateObject, mockGenerateObject };
});

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/llms", () => ({
  createGenerateObject: mockCreateGenerateObject,
}));
vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    provider: "openai",
    modelName: "gpt-5.1-mini",
    model: {},
    providerOptions: undefined,
    fallbackModels: [],
  })),
}));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAi: vi.fn().mockResolvedValue({
    id: "account-1",
    userId: "user-1",
    email: "user@example.com",
    about: null,
    multiRuleSelectionEnabled: false,
    timezone: "UTC",
    calendarBookingLink: null,
    name: "User",
    user: {
      aiProvider: "openai",
      aiModel: "gpt-5.1",
      aiApiKey: null,
    },
    account: {
      provider: "google",
    },
  }),
}));

const logger = createScopedLogger("reply-memory-test");

describe("reply-memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters out unchanged draft edits after normalization", () => {
    expect(
      isMeaningfulDraftEdit({
        draftText: "Thanks for your note.",
        sentText: "  thanks   for your note. ",
        similarityScore: 0.8,
      }),
    ).toBe(false);

    expect(
      isMeaningfulDraftEdit({
        draftText: "Thanks for your note.",
        sentText: "Please send pricing details.",
        similarityScore: 0.4,
      }),
    ).toBe(true);
  });

  it("retrieves the most relevant sender and global reply memories", async () => {
    vi.mocked(prisma.replyMemory.findMany).mockResolvedValue([
      createReplyMemory({
        title: "short replies",
        content: "Keep replies to 1-2 sentences.",
        kind: ReplyMemoryKind.STYLE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
      }),
      createReplyMemory({
        title: "pricing",
        content: "Mention that pricing depends on seat count.",
        kind: ReplyMemoryKind.FACT,
        scopeType: ReplyMemoryScopeType.TOPIC,
        scopeValue: "pricing",
        tags: ["pricing", "seats"],
      }),
      createReplyMemory({
        title: "vendor sender preference",
        content: "For this sender, mention annual billing first.",
        kind: ReplyMemoryKind.FACT,
        scopeType: ReplyMemoryScopeType.SENDER,
        scopeValue: "sales@example.com",
      }),
      createReplyMemory({
        title: "irrelevant topic",
        content: "Talk about onboarding docs.",
        kind: ReplyMemoryKind.FACT,
        scopeType: ReplyMemoryScopeType.TOPIC,
        scopeValue: "onboarding",
        tags: ["onboarding"],
      }),
    ] as any);

    const result = await getReplyMemoryContent({
      emailAccountId: "account-1",
      senderEmail: "sales@example.com",
      emailContent: "What pricing should I share for a 30 seat team?",
      logger,
    });

    expect(result).toContain("Keep replies to 1-2 sentences.");
    expect(result).toContain("pricing depends on seat count");
    expect(result).toContain("annual billing first");
    expect(result).not.toContain("onboarding docs");
  });

  it("processes draft edit evidence into active reply memories", async () => {
    vi.mocked(prisma.replyMemoryEvidence.deleteMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.replyMemoryEvidence.findMany).mockResolvedValue([
      {
        id: "evidence-1",
        emailAccountId: "account-1",
        executedActionId: "action-1",
        sourceMessageId: "source-1",
        sentMessageId: "sent-1",
        threadId: "thread-1",
        draftText: "Thanks for reaching out.",
        sentText: "Thanks for reaching out. Pricing depends on seat count.",
        similarityScore: 0.5,
        processedAt: null,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-03-17T10:00:00.000Z"),
        updatedAt: new Date("2026-03-17T10:00:00.000Z"),
      },
    ] as any);
    vi.mocked(prisma.replyMemory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.replyMemory.upsert).mockResolvedValue(
      createReplyMemory({}) as any,
    );
    vi.mocked(prisma.replyMemoryEvidence.update).mockResolvedValue({} as any);
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          {
            title: "pricing answer",
            content: "Mention that pricing depends on seat count.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "pricing",
            tags: ["pricing", "seats"],
          },
        ],
      },
    });

    const provider = {
      getMessage: vi.fn().mockResolvedValue(createSourceMessage()),
    };

    await syncReplyMemoriesFromEvidence({
      emailAccountId: "account-1",
      provider: provider as any,
      logger,
    });

    expect(provider.getMessage).toHaveBeenCalledWith("source-1");
    expect(prisma.replyMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          title: "pricing answer",
          content: "Mention that pricing depends on seat count.",
          scopeType: ReplyMemoryScopeType.TOPIC,
          scopeValue: "pricing",
          tags: ["pricing", "seats"],
        }),
      }),
    );
    expect(prisma.replyMemoryEvidence.update).toHaveBeenCalledWith({
      where: { id: "evidence-1" },
      data: { processedAt: expect.any(Date) },
    });
  });

  it("normalizes extracted reply memories before returning them", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          {
            title: " pricing answer ",
            content: " Mention that pricing depends on seat count. ",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "ignored for global scope",
            tags: ["Pricing", " seats ", "Pricing"],
          },
        ],
      },
    });

    const result = await aiExtractReplyMemoriesFromDraftEdit({
      emailAccount: {
        id: "account-1",
        userId: "user-1",
        email: "user@example.com",
        about: null,
        multiRuleSelectionEnabled: false,
        timezone: "UTC",
        calendarBookingLink: null,
        name: "User",
        user: {
          aiProvider: "openai",
          aiModel: "gpt-5.1",
          aiApiKey: null,
        },
        account: {
          provider: "google",
        },
      } as any,
      incomingEmailContent:
        "Can you share what pricing we use for larger teams?",
      draftText: "Pricing is available on our website.",
      sentText: "Pricing depends on seat count.",
      senderEmail: "partner@example.com",
      existingMemories: [],
    });

    expect(result).toEqual([
      {
        title: "pricing answer",
        content: "Mention that pricing depends on seat count.",
        kind: ReplyMemoryKind.FACT,
        scopeType: ReplyMemoryScopeType.GLOBAL,
        scopeValue: "",
        tags: ["pricing", "seats"],
      },
    ]);
  });
});

function createReplyMemory(
  overrides: Partial<{
    id: string;
    title: string;
    content: string;
    tags: string[];
    kind: ReplyMemoryKind;
    scopeType: ReplyMemoryScopeType;
    scopeValue: string;
    status: ReplyMemoryStatus;
    createdAt: Date;
    updatedAt: Date;
    emailAccountId: string;
  }>,
) {
  return {
    id: "memory-1",
    title: "memory",
    content: "memory content",
    tags: [],
    kind: ReplyMemoryKind.FACT,
    scopeType: ReplyMemoryScopeType.GLOBAL,
    scopeValue: "",
    status: ReplyMemoryStatus.ACTIVE,
    createdAt: new Date("2026-03-17T09:00:00.000Z"),
    updatedAt: new Date("2026-03-17T09:00:00.000Z"),
    emailAccountId: "account-1",
    ...overrides,
  };
}

function createSourceMessage(): ParsedMessage {
  return {
    id: "source-1",
    threadId: "thread-1",
    internalDate: "1710000000000",
    headers: {
      from: "Sales Team <sales@example.com>",
      to: "user@example.com",
      subject: "Pricing question",
      date: "2026-03-17T10:00:00.000Z",
      "message-id": "<source-1@example.com>",
    },
    textPlain: "Can you share pricing for a larger team?",
    textHtml: "<p>Can you share pricing for a larger team?</p>",
  } as ParsedMessage;
}
