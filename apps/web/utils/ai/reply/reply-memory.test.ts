import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  getReplyMemoryContent,
  getReplyMemoriesForPrompt,
  isMeaningfulDraftEdit,
  syncReplyMemoriesFromDraftSendLogs,
} from "./reply-memory";
import { aiExtractReplyMemoriesFromDraftEdit } from "./extract-reply-memories";

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
    modelName: "gpt-5-mini",
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
      aiProvider: null,
      aiModel: null,
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
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.emailAccount.update).mockResolvedValue({} as any);
    vi.mocked(prisma.replyMemory.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.replyMemory.count).mockResolvedValue(0 as any);
    vi.mocked(prisma.replyMemory.updateMany).mockResolvedValue({
      count: 0,
    } as any);
    vi.mocked(prisma.replyMemorySource.count).mockResolvedValue(0 as any);
    vi.mocked(prisma.replyMemorySource.updateMany).mockResolvedValue({
      count: 0,
    } as any);
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
    vi.mocked(prisma.replyMemory.findMany)
      .mockResolvedValueOnce([
        createReplyMemory({
          title: "vendor sender preference",
          content: "For this sender, mention annual billing first.",
          kind: ReplyMemoryKind.FACT,
          scopeType: ReplyMemoryScopeType.SENDER,
          scopeValue: "sales@example.com",
        }),
      ] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([
        createReplyMemory({
          title: "company positioning",
          content: "Use the current product positioning language.",
          kind: ReplyMemoryKind.PROCEDURE,
          scopeType: ReplyMemoryScopeType.GLOBAL,
        }),
      ] as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      createReplyMemory({
        id: "topic-pricing",
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

    expect(result).toContain("Use the current product positioning language.");
    expect(result).toContain("pricing depends on seat count");
    expect(result).toContain("annual billing first");
    expect(prisma.replyMemory.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        emailAccountId: "account-1",
        kind: {
          in: [ReplyMemoryKind.FACT, ReplyMemoryKind.PROCEDURE],
        },
        scopeType: ReplyMemoryScopeType.SENDER,
        scopeValue: "sales@example.com",
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    });
    expect(prisma.replyMemory.findMany).toHaveBeenNthCalledWith(3, {
      where: {
        emailAccountId: "account-1",
        kind: {
          in: [ReplyMemoryKind.FACT, ReplyMemoryKind.PROCEDURE],
        },
        scopeType: ReplyMemoryScopeType.GLOBAL,
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it("returns selected reply memory metadata for observability", async () => {
    vi.mocked(prisma.replyMemory.findMany)
      .mockResolvedValueOnce([
        createReplyMemory({
          id: "sender-memory",
          title: "vendor sender preference",
          content: "For this sender, mention annual billing first.",
          kind: ReplyMemoryKind.FACT,
          scopeType: ReplyMemoryScopeType.SENDER,
          scopeValue: "sales@example.com",
        }),
      ] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([
        createReplyMemory({
          id: "global-memory",
          title: "company positioning",
          content: "Use the current product positioning language.",
          kind: ReplyMemoryKind.PROCEDURE,
          scopeType: ReplyMemoryScopeType.GLOBAL,
        }),
      ] as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      createReplyMemory({
        id: "topic-memory",
        title: "pricing",
        content: "Mention that pricing depends on seat count.",
        kind: ReplyMemoryKind.FACT,
        scopeType: ReplyMemoryScopeType.TOPIC,
        scopeValue: "pricing",
      }),
    ] as any);

    const result = await getReplyMemoriesForPrompt({
      emailAccountId: "account-1",
      senderEmail: "sales@example.com",
      emailContent: "What pricing should I share for a 30 seat team?",
      logger,
    });

    expect(result.content).toContain(
      "Use the current product positioning language.",
    );
    expect(result.selectedMemories).toHaveLength(3);
    expect(result.selectedMemories).toEqual(
      expect.arrayContaining([
        {
          id: "sender-memory",
          kind: ReplyMemoryKind.FACT,
          scopeType: ReplyMemoryScopeType.SENDER,
        },
        {
          id: "global-memory",
          kind: ReplyMemoryKind.PROCEDURE,
          scopeType: ReplyMemoryScopeType.GLOBAL,
        },
        {
          id: "topic-memory",
          kind: ReplyMemoryKind.FACT,
          scopeType: ReplyMemoryScopeType.TOPIC,
        },
      ]),
    );
  });

  it("keeps sender memories ahead of newer global memories when retrieval is capped", async () => {
    vi.mocked(prisma.replyMemory.findMany)
      .mockResolvedValueOnce([
        createReplyMemory({
          id: "sender-memory",
          title: "sender preference",
          content: "Mention annual billing first for this sender.",
          kind: ReplyMemoryKind.FACT,
          scopeType: ReplyMemoryScopeType.SENDER,
          scopeValue: "sales@example.com",
          updatedAt: new Date("2026-03-17T08:00:00.000Z"),
        }),
      ] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce(
        Array.from({ length: 6 }, (_, index) =>
          createReplyMemory({
            id: `global-${index}`,
            title: `global ${index}`,
            content: `Global memory ${index}.`,
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            updatedAt: new Date(`2026-03-17T09:0${index}:00.000Z`),
          }),
        ) as any,
      );
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    const result = await getReplyMemoryContent({
      emailAccountId: "account-1",
      senderEmail: "sales@example.com",
      emailContent: "Can you share pricing details?",
      logger,
    });

    expect(result).toContain("annual billing first for this sender");
    expect(result?.split("\n")).toHaveLength(6);
    expect(result?.split("\n")[0]).toContain(
      "annual billing first for this sender",
    );
  });

  it("keeps topic memories ahead of newer global memories when retrieval is capped", async () => {
    vi.mocked(prisma.replyMemory.findMany)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce(
        Array.from({ length: 6 }, (_, index) =>
          createReplyMemory({
            id: `global-${index}`,
            title: `global ${index}`,
            content: `Global memory ${index}.`,
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            updatedAt: new Date(`2026-03-17T09:0${index}:00.000Z`),
          }),
        ) as any,
      );
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      createReplyMemory({
        id: "topic-pricing",
        title: "pricing guidance",
        content: "Mention that enterprise pricing depends on seat count.",
        kind: ReplyMemoryKind.FACT,
        scopeType: ReplyMemoryScopeType.TOPIC,
        scopeValue: "pricing",
        updatedAt: new Date("2026-03-16T08:00:00.000Z"),
      }),
    ] as any);

    const result = await getReplyMemoryContent({
      emailAccountId: "account-1",
      senderEmail: "sales@example.com",
      emailContent: "Can you resend the pricing guidance?",
      logger,
    });

    expect(result).toContain("enterprise pricing depends on seat count");
    expect(result?.split("\n")).toHaveLength(6);
    expect(result?.split("\n")[0]).toContain(
      "enterprise pricing depends on seat count",
    );
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
          newReplyMemoryDecision({
            content: "Mention that pricing depends on seat count.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "pricing",
          }),
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
          kind: {
            in: [ReplyMemoryKind.FACT, ReplyMemoryKind.PROCEDURE],
          },
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
    expect(prisma.replyMemory.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        emailAccountId: "account-1",
        kind: ReplyMemoryKind.PREFERENCE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
        isLearnedStyleEvidence: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 4,
    });
    expect(prisma.replyMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          content: "Mention that pricing depends on seat count.",
          scopeType: ReplyMemoryScopeType.TOPIC,
          scopeValue: "pricing",
          isLearnedStyleEvidence: false,
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
      },
    });
  });

  it("attaches evidence to an existing memory when extraction returns an existing memory id", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText:
          "Thanks for reaching out. Pricing depends on seat count and annual billing.",
      }),
    ] as any);
    vi.mocked(prisma.replyMemory.findMany)
      .mockResolvedValueOnce([
        createReplyMemory({
          id: "existing-pricing-memory",
          content:
            "Mention that enterprise pricing depends on seat count and annual billing.",
          kind: ReplyMemoryKind.FACT,
          scopeType: ReplyMemoryScopeType.GLOBAL,
          createdAt: new Date("2026-03-10T09:00:00.000Z"),
          updatedAt: new Date("2026-03-10T09:00:00.000Z"),
        }),
      ] as any)
      .mockResolvedValueOnce([] as any);
    vi.mocked(prisma.replyMemory.update).mockResolvedValue(
      createReplyMemory({
        id: "existing-pricing-memory",
        content:
          "Mention that enterprise pricing depends on seat count and annual billing.",
        kind: ReplyMemoryKind.FACT,
        scopeType: ReplyMemoryScopeType.GLOBAL,
      }) as any,
    );
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        memories: [existingReplyMemoryDecision("existing-pricing-memory")],
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
    expect(prisma.replyMemory.update).toHaveBeenCalledWith({
      where: { id: "existing-pricing-memory" },
      data: {
        isLearnedStyleEvidence: false,
      },
    });
    expect(prisma.replyMemorySource.upsert).toHaveBeenCalledWith({
      where: {
        replyMemoryId_draftSendLogId: {
          replyMemoryId: "existing-pricing-memory",
          draftSendLogId: "draft-send-log-1",
        },
      },
      create: {
        replyMemoryId: "existing-pricing-memory",
        draftSendLogId: "draft-send-log-1",
      },
      update: {},
    });
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("warns and skips unknown existing memory ids returned by extraction", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText:
          "Thanks for reaching out. Pricing depends on seat count and annual billing.",
      }),
    ] as any);
    vi.mocked(prisma.replyMemory.findMany)
      .mockResolvedValueOnce([
        createReplyMemory({
          id: "existing-pricing-memory",
          content:
            "Mention that enterprise pricing depends on seat count and annual billing.",
          kind: ReplyMemoryKind.FACT,
          scopeType: ReplyMemoryScopeType.GLOBAL,
          createdAt: new Date("2026-03-10T09:00:00.000Z"),
          updatedAt: new Date("2026-03-10T09:00:00.000Z"),
        }),
      ] as any)
      .mockResolvedValueOnce([] as any);
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        memories: [existingReplyMemoryDecision("missing-pricing-memory")],
      },
    });

    const provider = {
      getMessage: vi.fn().mockResolvedValue(createSourceMessage()),
    };
    const testLogger = createScopedLogger("reply-memory-test-unknown-id");
    const warnSpy = vi.spyOn(testLogger, "warn").mockImplementation(() => {});

    await syncReplyMemoriesFromDraftSendLogs({
      emailAccountId: "account-1",
      provider: provider as any,
      logger: testLogger,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "Reply memory extraction returned unknown existing memory id",
      {
        emailAccountId: "account-1",
        draftSendLogId: "draft-send-log-1",
        matchingExistingMemoryId: "missing-pricing-memory",
      },
    );
    expect(prisma.replyMemory.update).not.toHaveBeenCalled();
    expect(prisma.replyMemory.upsert).not.toHaveBeenCalled();
    expect(prisma.replyMemorySource.upsert).not.toHaveBeenCalled();
  });

  it("does not refresh learned writing style before enough preference evidence exists", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Pricing depends on seat count.",
      }),
    ] as any);
    vi.mocked(prisma.replyMemory.findMany).mockResolvedValueOnce([] as any);
    vi.mocked(prisma.replyMemorySource.count)
      .mockResolvedValueOnce(9 as any)
      .mockResolvedValueOnce(9 as any);
    vi.mocked(prisma.replyMemory.upsert).mockResolvedValue(
      createReplyMemory({
        id: "style-memory",
        title: "concise tone",
        kind: ReplyMemoryKind.PREFERENCE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
      }) as any,
    );
    vi.mocked(prisma.emailAccount.findUnique)
      .mockResolvedValueOnce({ learnedWritingStyle: null } as any)
      .mockResolvedValueOnce({ learnedWritingStyle: null } as any);
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        memories: [
          newReplyMemoryDecision({
            content: "Keep replies short and remove filler.",
            kind: ReplyMemoryKind.PREFERENCE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          }),
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

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    expect(prisma.replyMemorySource.updateMany).not.toHaveBeenCalled();
  });

  it("marks persisted preference memories as learned-style eligible", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Got it. I will review and get back to you.",
      }),
    ] as any);
    vi.mocked(prisma.replyMemory.upsert).mockResolvedValue(
      createReplyMemory({
        id: "preference-memory",
        kind: ReplyMemoryKind.PREFERENCE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
      }) as any,
    );
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          newReplyMemoryDecision({
            content: "Keep routine replies direct and low ceremony.",
            kind: ReplyMemoryKind.PREFERENCE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          }),
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

    expect(prisma.replyMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          content: "Keep routine replies direct and low ceremony.",
          scopeType: ReplyMemoryScopeType.GLOBAL,
          scopeValue: "",
          isLearnedStyleEvidence: true,
        }),
        update: expect.objectContaining({
          content: "Keep routine replies direct and low ceremony.",
          isLearnedStyleEvidence: true,
        }),
      }),
    );
  });

  it("refreshes learned writing style from repeated sources on one preference memory", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Pricing depends on seat count.",
      }),
    ] as any);
    vi.mocked(prisma.replyMemory.findMany).mockResolvedValueOnce([] as any);
    vi.mocked(prisma.replyMemorySource.findMany)
      .mockResolvedValueOnce([
        createPreferenceWritingEvidence({
          replyMemoryId: "style-memory",
          draftSendLogId: "draft-send-log-1",
          learnedWritingStyleAnalyzedAt: null,
          replyMemory: createReplyMemory({
            id: "style-memory",
            title: "concise tone",
            content: "Keep replies short and remove filler.",
            kind: ReplyMemoryKind.PREFERENCE,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "pricing",
          }),
          draftSendLog: createDraftSendLog({
            id: "draft-send-log-1",
            draftText: "Draft version with more filler and extra wording.",
            replyMemorySentText: "Sent version with the filler removed.",
          }),
        }),
        createPreferenceWritingEvidence({
          replyMemoryId: "style-memory",
          draftSendLogId: "draft-send-log-older",
          learnedWritingStyleAnalyzedAt: null,
          replyMemory: createReplyMemory({
            id: "style-memory",
            title: "concise tone",
            content: "Keep replies short and remove filler.",
            kind: ReplyMemoryKind.PREFERENCE,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "pricing",
          }),
          draftSendLog: createDraftSendLog({
            id: "draft-send-log-older",
            draftText: "Older draft with extra padding.",
            replyMemorySentText: "Older sent reply with padding removed.",
          }),
        }),
      ] as any)
      .mockResolvedValueOnce([
        createPreferenceWritingEvidence({
          replyMemoryId: "style-memory",
          draftSendLogId: "draft-send-log-oldest",
          learnedWritingStyleAnalyzedAt: new Date("2026-03-16T10:00:00.000Z"),
          replyMemory: createReplyMemory({
            id: "style-memory",
            title: "concise tone",
            content: "Keep replies short and remove filler.",
            kind: ReplyMemoryKind.PREFERENCE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
          }),
          draftSendLog: createDraftSendLog({
            id: "draft-send-log-oldest",
            draftText: "Oldest draft with a long warm intro.",
            replyMemorySentText: "Oldest sent reply with the intro removed.",
          }),
        }),
      ] as any);
    vi.mocked(prisma.replyMemorySource.count)
      .mockResolvedValueOnce(10 as any)
      .mockResolvedValueOnce(5 as any);
    vi.mocked(prisma.replyMemory.upsert).mockResolvedValue(
      createReplyMemory({
        id: "style-memory",
        title: "concise tone",
        kind: ReplyMemoryKind.PREFERENCE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
      }) as any,
    );
    vi.mocked(prisma.emailAccount.findUnique)
      .mockResolvedValueOnce({ learnedWritingStyle: null } as any)
      .mockResolvedValueOnce({ learnedWritingStyle: null } as any);
    vi.mocked(prisma.emailAccount.update).mockResolvedValue({} as any);
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          memories: [
            newReplyMemoryDecision({
              content: "Keep replies short and remove filler.",
              kind: ReplyMemoryKind.PREFERENCE,
              scopeType: ReplyMemoryScopeType.GLOBAL,
              scopeValue: "",
            }),
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          learnedWritingStyle:
            "Observed patterns:\n- Keep replies direct and compact.\nRepresentative edits:\n- Trim filler before sending.",
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

    expect(prisma.replyMemorySource.count).toHaveBeenNthCalledWith(1, {
      where: {
        replyMemory: {
          is: {
            emailAccountId: "account-1",
            kind: ReplyMemoryKind.PREFERENCE,
            isLearnedStyleEvidence: true,
          },
        },
      },
    });
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "account-1" },
      data: {
        learnedWritingStyle:
          "Observed patterns:\n- Keep replies direct and compact.\nRepresentative edits:\n- Trim filler before sending.",
      },
    });
    expect(prisma.replyMemorySource.updateMany).toHaveBeenCalledWith({
      where: {
        learnedWritingStyleAnalyzedAt: null,
        OR: [
          {
            replyMemoryId: "style-memory",
            draftSendLogId: "draft-send-log-1",
          },
          {
            replyMemoryId: "style-memory",
            draftSendLogId: "draft-send-log-older",
          },
        ],
      },
      data: {
        learnedWritingStyleAnalyzedAt: expect.any(Date),
      },
    });
  });

  it("normalizes extracted preference memories to global scope", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          newReplyMemoryDecision({
            content: "Keep replies short and remove filler.",
            kind: ReplyMemoryKind.PREFERENCE,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "pricing",
          }),
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
          aiProvider: null,
          aiModel: null,
          aiApiKey: null,
        },
        account: {
          provider: "google",
        },
      } as any,
      incomingEmailContent: "Can you resend the pricing summary?",
      draftText: "Hi there, pricing is on the website.",
      sentText: "Pricing depends on seat count and billing plan.",
      senderEmail: "partner@example.com",
      existingMemories: [],
    });

    expect(result).toEqual([
      newReplyMemoryDecision({
        content: "Keep replies short and remove filler.",
        kind: ReplyMemoryKind.PREFERENCE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
        scopeValue: "",
      }),
    ]);
  });

  it("increments retry state when the source email cannot be loaded", async () => {
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
    expect(prisma.draftSendLog.update).toHaveBeenCalledWith({
      where: { id: "draft-send-log-1" },
      data: {
        replyMemoryAttemptCount: { increment: 1 },
      },
    });
  });

  it("increments retry state when non-source reply memory processing fails", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Pricing depends on seat count.",
      }),
    ] as any);
    vi.mocked(prisma.replyMemory.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.replyMemory.upsert).mockRejectedValue(
      new Error("database unavailable"),
    );
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          newReplyMemoryDecision({
            content: "Mention that pricing depends on seat count.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "pricing",
          }),
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

    expect(prisma.draftSendLog.update).toHaveBeenCalledWith({
      where: { id: "draft-send-log-1" },
      data: {
        replyMemoryAttemptCount: { increment: 1 },
      },
    });
  });

  it("stops a failing draft send log from starving newer pending rows", async () => {
    const draftSendLogs = [
      createDraftSendLog({
        id: "draft-send-log-1",
        sourceMessageId: "source-fail",
        createdAt: new Date("2026-03-17T10:00:00.000Z"),
      }),
      createDraftSendLog({
        id: "draft-send-log-2",
        sourceMessageId: "source-2",
        createdAt: new Date("2026-03-17T10:01:00.000Z"),
      }),
      createDraftSendLog({
        id: "draft-send-log-3",
        sourceMessageId: "source-3",
        createdAt: new Date("2026-03-17T10:02:00.000Z"),
      }),
      createDraftSendLog({
        id: "draft-send-log-4",
        sourceMessageId: "source-4",
        createdAt: new Date("2026-03-17T10:03:00.000Z"),
      }),
      createDraftSendLog({
        id: "draft-send-log-5",
        sourceMessageId: "source-5",
        createdAt: new Date("2026-03-17T10:04:00.000Z"),
      }),
      createDraftSendLog({
        id: "draft-send-log-6",
        sourceMessageId: "source-6",
        createdAt: new Date("2026-03-17T10:05:00.000Z"),
      }),
    ];

    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockImplementation(async () => {
      return draftSendLogs
        .filter(
          (log) =>
            !log.replyMemoryProcessedAt &&
            !!log.replyMemorySentText &&
            log.replyMemoryAttemptCount < 3,
        )
        .sort(
          (left, right) =>
            left.replyMemoryAttemptCount - right.replyMemoryAttemptCount ||
            left.createdAt.getTime() - right.createdAt.getTime(),
        )
        .slice(0, 5) as any;
    });
    vi.mocked(prisma.draftSendLog.update).mockImplementation(
      async ({ where, data }: any) => {
        const log = draftSendLogs.find((entry) => entry.id === where.id)!;
        if (data.replyMemoryAttemptCount?.increment) {
          log.replyMemoryAttemptCount += data.replyMemoryAttemptCount.increment;
        }
        if ("replyMemoryProcessedAt" in data) {
          log.replyMemoryProcessedAt = data.replyMemoryProcessedAt ?? null;
        }
        if ("replyMemorySentText" in data) {
          log.replyMemorySentText = data.replyMemorySentText ?? null;
        }
        return log as any;
      },
    );
    vi.mocked(prisma.replyMemory.findMany).mockResolvedValue([] as any);
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [],
      },
    });

    const provider = {
      getMessage: vi.fn().mockImplementation(async (messageId: string) => {
        if (messageId === "source-fail") return null;
        return createSourceMessage();
      }),
    };

    await syncReplyMemoriesFromDraftSendLogs({
      emailAccountId: "account-1",
      provider: provider as any,
      logger,
    });

    expect(provider.getMessage).not.toHaveBeenCalledWith("source-6");

    await syncReplyMemoriesFromDraftSendLogs({
      emailAccountId: "account-1",
      provider: provider as any,
      logger,
    });

    expect(provider.getMessage).toHaveBeenCalledWith("source-6");
    expect(
      draftSendLogs.find((log) => log.id === "draft-send-log-1")
        ?.replyMemoryAttemptCount,
    ).toBe(2);
  });

  it("marks a draft send log processed after repeated source lookup failures", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Pricing depends on seat count.",
        replyMemoryAttemptCount: 2,
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

    expect(prisma.draftSendLog.update).toHaveBeenCalledWith({
      where: { id: "draft-send-log-1" },
      data: {
        replyMemoryAttemptCount: { increment: 1 },
        replyMemoryProcessedAt: expect.any(Date),
        replyMemorySentText: null,
      },
    });
  });

  it("marks a draft send log processed after repeated non-source processing failures", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Pricing depends on seat count.",
        replyMemoryAttemptCount: 2,
      }),
    ] as any);
    vi.mocked(prisma.replyMemory.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.replyMemory.upsert).mockRejectedValue(
      new Error("database unavailable"),
    );
    vi.mocked(prisma.draftSendLog.update).mockResolvedValue({} as any);
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          newReplyMemoryDecision({
            content: "Mention that pricing depends on seat count.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "pricing",
          }),
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

    expect(prisma.draftSendLog.update).toHaveBeenCalledWith({
      where: { id: "draft-send-log-1" },
      data: {
        replyMemoryAttemptCount: { increment: 1 },
        replyMemoryProcessedAt: expect.any(Date),
        replyMemorySentText: null,
      },
    });
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

  it("uses the actual sender context when a sender-scoped memory omits scope value", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Pricing depends on seat count.",
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
          newReplyMemoryDecision({
            content: "Mention annual billing first.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.SENDER,
            scopeValue: "   ",
          }),
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

    expect(prisma.replyMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          scopeType: ReplyMemoryScopeType.SENDER,
          scopeValue: "sales@example.com",
        }),
      }),
    );
    expect(prisma.draftSendLog.update).toHaveBeenCalledWith({
      where: { id: "draft-send-log-1" },
      data: {
        replyMemoryProcessedAt: expect.any(Date),
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
          newReplyMemoryDecision({
            content: "Mention that pricing depends on seat count.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "   ",
          }),
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

  it("clamps sender and domain scope values to the actual source context", async () => {
    vi.mocked(prisma.draftSendLog.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.draftSendLog.findMany).mockResolvedValue([
      createDraftSendLog({
        replyMemorySentText: "Pricing depends on seat count.",
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
          newReplyMemoryDecision({
            content: "Mention annual billing first.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.SENDER,
            scopeValue: "attacker@example.com",
          }),
          newReplyMemoryDecision({
            content: "Reference the enterprise plan.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.DOMAIN,
            scopeValue: "evil.example",
          }),
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

    expect(prisma.replyMemory.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          scopeType: ReplyMemoryScopeType.SENDER,
          scopeValue: "sales@example.com",
        }),
      }),
    );
    expect(prisma.replyMemory.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          scopeType: ReplyMemoryScopeType.DOMAIN,
          scopeValue: "example.com",
        }),
      }),
    );
  });

  it("normalizes extracted reply memories before returning them", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          newReplyMemoryDecision({
            content: " Mention that pricing depends on seat count. ",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "ignored for global scope",
          }),
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
          aiProvider: null,
          aiModel: null,
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
      newReplyMemoryDecision({
        content: "Mention that pricing depends on seat count.",
        kind: ReplyMemoryKind.FACT,
        scopeType: ReplyMemoryScopeType.GLOBAL,
        scopeValue: "",
      }),
    ]);
  });

  it("caps extracted reply memories at the per-edit limit", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [
          newReplyMemoryDecision({
            content: "First memory.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          }),
          newReplyMemoryDecision({
            content: "Second memory.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          }),
          newReplyMemoryDecision({
            content: "Third memory.",
            kind: ReplyMemoryKind.PREFERENCE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          }),
          newReplyMemoryDecision({
            content: "Fourth memory.",
            kind: ReplyMemoryKind.PREFERENCE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          }),
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
          aiProvider: null,
          aiModel: null,
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
    expect(result.map((memory) => memory.newMemory?.content ?? null)).toEqual([
      "First memory.",
      "Second memory.",
      "Third memory.",
    ]);
  });

  it("returns an existing memory id when the model matches an existing memory", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        memories: [existingReplyMemoryDecision("existing-pricing-memory")],
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
          aiProvider: null,
          aiModel: null,
          aiApiKey: null,
        },
        account: {
          provider: "google",
        },
      } as any,
      incomingEmailContent:
        "Can you resend the enterprise pricing summary for larger teams?",
      draftText: "Pricing is on our website.",
      sentText:
        "Enterprise pricing depends on seat count and whether the customer wants annual billing.",
      senderEmail: "partner@example.com",
      existingMemories: [
        {
          id: "existing-pricing-memory",
          content:
            "Enterprise pricing depends on seat count and whether the customer wants annual billing.",
          kind: ReplyMemoryKind.FACT,
          scopeType: ReplyMemoryScopeType.GLOBAL,
          scopeValue: "",
        },
      ],
    });

    expect(result).toEqual([
      existingReplyMemoryDecision("existing-pricing-memory"),
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
          aiProvider: null,
          aiModel: null,
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
    isLearnedStyleEvidence: boolean;
    createdAt: Date;
    updatedAt: Date;
    emailAccountId: string;
  }>,
) {
  const kind = overrides.kind ?? ReplyMemoryKind.FACT;
  const scopeType = overrides.scopeType ?? ReplyMemoryScopeType.GLOBAL;
  const scopeValue = overrides.scopeValue ?? "";
  const content = overrides.content ?? overrides.title ?? "memory";

  return {
    id: overrides.id ?? `${scopeType}:${scopeValue}:${content}`,
    content,
    kind,
    scopeType,
    scopeValue,
    isLearnedStyleEvidence:
      overrides.isLearnedStyleEvidence ?? kind === ReplyMemoryKind.PREFERENCE,
    createdAt: new Date("2026-03-17T09:00:00.000Z"),
    updatedAt: new Date("2026-03-17T09:00:00.000Z"),
    emailAccountId: "account-1",
    ...overrides,
  };
}

function createPreferenceWritingEvidence(
  overrides: Partial<{
    replyMemoryId: string;
    draftSendLogId: string;
    createdAt: Date;
    learnedWritingStyleAnalyzedAt: Date | null;
    replyMemory: ReturnType<typeof createReplyMemory>;
    draftSendLog: ReturnType<typeof createDraftSendLog>;
  }>,
) {
  return {
    replyMemoryId: overrides.replyMemoryId ?? "style-memory",
    draftSendLogId: overrides.draftSendLogId ?? "draft-send-log-1",
    createdAt: overrides.createdAt ?? new Date("2026-03-17T10:00:00.000Z"),
    learnedWritingStyleAnalyzedAt:
      overrides.learnedWritingStyleAnalyzedAt ?? null,
    replyMemory:
      overrides.replyMemory ??
      createReplyMemory({
        id: "style-memory",
        title: "concise tone",
        content: "Keep replies short and remove filler.",
        kind: ReplyMemoryKind.PREFERENCE,
        scopeType: ReplyMemoryScopeType.GLOBAL,
      }),
    draftSendLog:
      overrides.draftSendLog ??
      createDraftSendLog({
        id: "draft-send-log-1",
        draftText: "Draft version with more filler and extra wording.",
        replyMemorySentText: "Sent version with the filler removed.",
      }),
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
    replyMemoryAttemptCount: number;
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
    replyMemoryAttemptCount: overrides.replyMemoryAttemptCount ?? 0,
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

function newReplyMemoryDecision(newMemory: {
  content: string;
  kind: ReplyMemoryKind;
  scopeType: ReplyMemoryScopeType;
  scopeValue: string;
}) {
  return {
    matchingExistingMemoryId: null,
    newMemory,
  };
}

function existingReplyMemoryDecision(matchingExistingMemoryId: string) {
  return {
    matchingExistingMemoryId,
    newMemory: null,
  };
}
