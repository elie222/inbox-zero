import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  aiExtractReplyMemoriesFromDraftEdit,
  getReplyMemoryContent,
  isMeaningfulDraftEdit,
  syncReplyMemoriesFromDraftSendLogs,
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
vi.mock("@/utils/llms/retry", () => ({
  withNetworkRetry: vi.fn().mockImplementation((fn) => fn()),
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
      }),
      createReplyMemory({
        title: "vendor sender preference",
        content: "For this sender, mention annual billing first.",
        kind: ReplyMemoryKind.FACT,
        scopeType: ReplyMemoryScopeType.SENDER,
        scopeValue: "sales@example.com",
      }),
    ] as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      createReplyMemory({
        title: "pricing",
        content: "Mention that pricing depends on seat count.",
        kind: ReplyMemoryKind.FACT,
        scopeType: ReplyMemoryScopeType.TOPIC,
        scopeValue: "pricing",
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
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it("processes queued draft send logs into active reply memories", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText:
          "Thanks for reaching out. Pricing depends on seat count.",
      }),
    ] as any);
    vi.mocked(prisma.replyMemory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.replyMemory.upsert).mockResolvedValue(
      createReplyMemory({}) as any,
    );
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          {
            title: "pricing answer",
            content: "Mention that pricing depends on seat count.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "pricing",
          },
        ],
      },
    });

    const provider = {
      getMessage: vi.fn().mockResolvedValue(createSourceMessage()),
    };

    await syncReplyMemoriesFromDraftSendLogs({
      emailAccountId: "account-1",
      provider: provider as any,
      logger,
    });

    expect(provider.getMessage).toHaveBeenCalledWith("source-1");
    expect(prisma.replyMemory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { scopeType: ReplyMemoryScopeType.GLOBAL },
            { scopeType: ReplyMemoryScopeType.TOPIC },
            {
              scopeType: ReplyMemoryScopeType.SENDER,
              scopeValue: "sales@example.com",
            },
            {
              scopeType: ReplyMemoryScopeType.DOMAIN,
              scopeValue: "example.com",
            },
          ]),
        }),
      }),
    );
    expect(prisma.replyMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          title: "pricing answer",
          content: "Mention that pricing depends on seat count.",
          scopeType: ReplyMemoryScopeType.TOPIC,
          scopeValue: "pricing",
        }),
      }),
    );
    expect(prisma.replyMemorySource.upsert).toHaveBeenCalledWith({
      where: {
        replyMemoryId_draftSendLogId: {
          replyMemoryId: "GLOBAL::memory",
          draftSendLogId: "draft-send-log-1",
        },
      },
      create: {
        replyMemoryId: "GLOBAL::memory",
        draftSendLogId: "draft-send-log-1",
      },
      update: {},
    });
    expect(prisma.draftSendLog.update).toHaveBeenCalledWith({
      where: { id: "draft-send-log-1" },
      data: {
        replyMemoryProcessedAt: expect.any(Date),
        replyMemorySentText: null,
      },
    });
  });

  it("leaves draft send logs pending when the source email cannot be loaded", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Pricing depends on seat count.",
      }),
    ] as any);
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);

    const provider = {
      getMessage: vi.fn().mockResolvedValue(null),
    };

    await syncReplyMemoriesFromDraftSendLogs({
      emailAccountId: "account-1",
      provider: provider as any,
      logger,
    });

    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(prisma.replyMemory.upsert).not.toHaveBeenCalled();
    expect(prisma.draftSendLog.update).not.toHaveBeenCalled();
  });

  it("marks draft send logs processed when sender extraction fails", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Pricing depends on seat count.",
      }),
    ] as any);
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);

    const provider = {
      getMessage: vi.fn().mockResolvedValue(createSourceMessage({ from: "" })),
    };

    await syncReplyMemoriesFromDraftSendLogs({
      emailAccountId: "account-1",
      provider: provider as any,
      logger,
    });

    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(prisma.replyMemory.upsert).not.toHaveBeenCalled();
    expect(prisma.draftSendLog.update).toHaveBeenCalledWith({
      where: { id: "draft-send-log-1" },
      data: {
        replyMemoryProcessedAt: expect.any(Date),
        replyMemorySentText: null,
      },
    });
  });

  it("skips persisting scoped memories without a concrete scope value", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Pricing depends on seat count.",
      }),
    ] as any);
    vi.mocked(prisma.replyMemory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          {
            title: "sender preference",
            content: "Mention annual billing first.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.SENDER,
            scopeValue: "   ",
          },
        ],
      },
    });

    const provider = {
      getMessage: vi.fn().mockResolvedValue(createSourceMessage()),
    };

    await syncReplyMemoriesFromDraftSendLogs({
      emailAccountId: "account-1",
      provider: provider as any,
      logger,
    });

    expect(prisma.replyMemory.upsert).not.toHaveBeenCalled();
    expect(prisma.draftSendLog.update).toHaveBeenCalledWith({
      where: { id: "draft-send-log-1" },
      data: {
        replyMemoryProcessedAt: expect.any(Date),
        replyMemorySentText: null,
      },
    });
  });

  it("skips topic memories without a concrete scope value", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Pricing depends on seat count.",
      }),
    ] as any);
    vi.mocked(prisma.replyMemory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);
    vi.mocked(prisma.replyMemory.upsert).mockResolvedValue(
      createReplyMemory({}) as any,
    );
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          {
            title: "pricing guidance",
            content: "Mention that pricing depends on seat count.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "   ",
          },
        ],
      },
    });

    const provider = {
      getMessage: vi.fn().mockResolvedValue(createSourceMessage()),
    };

    await syncReplyMemoriesFromDraftSendLogs({
      emailAccountId: "account-1",
      provider: provider as any,
      logger,
    });

    expect(prisma.replyMemory.upsert).not.toHaveBeenCalled();
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
      },
    ]);
  });

  it("caps extracted reply memories at the per-edit limit", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          {
            title: "memory 1",
            content: "First memory.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          },
          {
            title: "memory 2",
            content: "Second memory.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          },
          {
            title: "memory 3",
            content: "Third memory.",
            kind: ReplyMemoryKind.STYLE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          },
          {
            title: "memory 4",
            content: "Fourth memory.",
            kind: ReplyMemoryKind.STYLE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
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
      incomingEmailContent: "Can you share pricing details?",
      draftText: "Pricing is on our website.",
      sentText: "Pricing depends on seat count and billing plan.",
      senderEmail: "partner@example.com",
      existingMemories: [],
    });

    expect(result).toHaveLength(3);
    expect(result.map((memory) => memory.title)).toEqual([
      "memory 1",
      "memory 2",
      "memory 3",
    ]);
  });

  it("returns no extracted memories when sender or edited content is missing", async () => {
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
      incomingEmailContent: "",
      draftText: "Thanks for reaching out.",
      sentText: "Thanks for reaching out.",
      senderEmail: "",
      existingMemories: [],
    });

    expect(result).toEqual([]);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });
});

function createReplyMemory(
  overrides: Partial<{
    id: string;
    title: string;
    content: string;
    kind: ReplyMemoryKind;
    scopeType: ReplyMemoryScopeType;
    scopeValue: string;
    createdAt: Date;
    updatedAt: Date;
    emailAccountId: string;
  }>,
) {
  const title = overrides.title ?? "memory";
  const scopeType = overrides.scopeType ?? ReplyMemoryScopeType.GLOBAL;
  const scopeValue = overrides.scopeValue ?? "";

  return {
    id: overrides.id ?? `${scopeType}:${scopeValue}:${title}`,
    title,
    content: "memory content",
    kind: ReplyMemoryKind.FACT,
    scopeType,
    scopeValue,
    createdAt: new Date("2026-03-17T09:00:00.000Z"),
    updatedAt: new Date("2026-03-17T09:00:00.000Z"),
    emailAccountId: "account-1",
    ...overrides,
  };
}

function createSourceMessage(
  overrides: Partial<ParsedMessage["headers"]> = {},
): ParsedMessage {
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
      ...overrides,
    },
    textPlain: "Can you share pricing for a larger team?",
    textHtml: "<p>Can you share pricing for a larger team?</p>",
  } as ParsedMessage;
}

function createDraftSendLog(
  overrides: Partial<{
    id: string;
    replyMemorySentText: string;
    draftText: string;
    sourceMessageId: string;
    emailAccountId: string;
    replyMemoryProcessedAt: Date | null;
    createdAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? "draft-send-log-1",
    createdAt: overrides.createdAt ?? new Date("2026-03-17T10:00:00.000Z"),
    replyMemoryProcessedAt: overrides.replyMemoryProcessedAt ?? null,
    replyMemorySentText:
      overrides.replyMemorySentText ?? "Pricing depends on seat count.",
    executedAction: {
      id: "action-1",
      content: overrides.draftText ?? "Thanks for reaching out.",
      executedRule: {
        emailAccountId: overrides.emailAccountId ?? "account-1",
        messageId: overrides.sourceMessageId ?? "source-1",
      },
    },
  };
}
