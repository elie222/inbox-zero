import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { MailLayout, MailSplitFilterKind } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  buildMailSplitFromPromptAction,
  createMailSplitAction,
  updateMailPreferencesAction,
  updateMailSplitAction,
} from "@/utils/actions/mail-split";
import { aiPromptToSplitFilters } from "@/utils/ai/split/prompt-to-split";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/ai/split/prompt-to-split", () => ({
  aiPromptToSplitFilters: vi.fn(),
}));

const EMAIL_ACCOUNT_ID = "email-account-1";

const PROMPT_OPTIONS = [
  {
    id: "label:label-1",
    name: "Receipts",
    kind: "LABEL" as const,
    value: "label-1",
  },
];

const UNREAD_FILTER = { kind: MailSplitFilterKind.UNREAD, value: null };

describe("mail split actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { userId: "user-1", provider: "google" },
    } as never);
  });

  it("creates splits behind an account-scoped database lock", async () => {
    const split = {
      id: "split-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "Unread",
      matchAll: true,
      order: 0,
      emailAccountId: EMAIL_ACCOUNT_ID,
    };
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      [{ status: "created", ...split }],
      1,
    ] as never);

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Unread",
      matchAll: true,
      filters: [UNREAD_FILTER],
    });

    expect(result?.data).toEqual({ split });
    expect(prisma.$queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining("pg_advisory_xact_lock"),
      ]),
      EMAIL_ACCOUNT_ID,
    );
  });

  it("returns a user-safe error when the split limit is reached", async () => {
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      [{ status: "limit" }],
      0,
    ] as never);

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Later",
      matchAll: true,
      filters: [UNREAD_FILTER],
    });

    expect(result?.serverError).toBe("You can only have 14 splits.");
  });

  it("returns a user-safe error when a split name already exists", async () => {
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      [{ status: "duplicate" }],
      0,
    ] as never);

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Unread",
      matchAll: true,
      filters: [UNREAD_FILTER],
    });

    expect(result?.serverError).toBe('You already have a "Unread" split.');
  });

  it("handles a duplicate-name constraint race with a safe error", async () => {
    prisma.$transaction.mockRejectedValue(createDuplicateNameError());

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Unread",
      matchAll: true,
      filters: [UNREAD_FILTER],
    });

    expect(result?.serverError).toBe('You already have a "Unread" split.');
  });

  it("rejects a condition that needs a value but has none", async () => {
    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Broken",
      matchAll: true,
      filters: [{ kind: MailSplitFilterKind.LABEL, value: null }],
    });

    expect(result?.validationErrors).toBeDefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("hands the AI's conditions back for review instead of creating a split", async () => {
    vi.mocked(aiPromptToSplitFilters).mockResolvedValue({
      name: "Unread receipts",
      matchAll: false,
      filters: [
        UNREAD_FILTER,
        { kind: MailSplitFilterKind.LABEL, value: "label-1" },
      ],
    });

    const result = await buildMailSplitFromPromptAction(EMAIL_ACCOUNT_ID, {
      prompt: "receipts I have not read",
      options: PROMPT_OPTIONS,
      senders: [],
    });

    expect(result?.data).toEqual({
      matchAll: false,
      name: "Unread receipts",
      filters: [
        UNREAD_FILTER,
        { kind: MailSplitFilterKind.LABEL, value: "label-1" },
      ],
    });
    // Nothing is written until the reader confirms in the builder.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns a user-safe error when the AI finds no usable conditions", async () => {
    vi.mocked(aiPromptToSplitFilters).mockResolvedValue({
      name: null,
      matchAll: true,
      filters: [],
    });

    const result = await buildMailSplitFromPromptAction(EMAIL_ACCOUNT_ID, {
      prompt: "flight itineraries",
      options: PROMPT_OPTIONS,
      senders: [],
    });

    expect(result?.serverError).toBe(
      "I couldn't find filters in that — name a sender, label or category.",
    );
  });

  it("returns a user-safe error when an edit duplicates another split's name", async () => {
    prisma.$transaction.mockRejectedValue(createDuplicateNameError());

    const result = await updateMailSplitAction(EMAIL_ACCOUNT_ID, {
      id: "split-1",
      name: "Unread",
      matchAll: true,
      filters: [UNREAD_FILTER],
    });

    expect(result?.serverError).toBe('You already have a "Unread" split.');
  });

  it("replaces an edited split's conditions in the same locked transaction", async () => {
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      { count: 1 },
      { count: 1 },
      1,
    ] as never);

    await updateMailSplitAction(EMAIL_ACCOUNT_ID, {
      id: "split-1",
      name: "Receipts",
      matchAll: false,
      filters: [{ kind: MailSplitFilterKind.LABEL, value: "label-1" }],
    });

    // Scoped through the split's owner: `id` is caller-supplied, so another
    // account's conditions must stay out of reach.
    expect(prisma.mailSplitFilter.deleteMany).toHaveBeenCalledWith({
      where: {
        mailSplitId: "split-1",
        mailSplit: { emailAccountId: EMAIL_ACCOUNT_ID },
      },
    });
    // One transaction, so a split can't end up renamed but still carrying its
    // old conditions.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("persists the selected mail layout", async () => {
    await updateMailPreferencesAction(EMAIL_ACCOUNT_ID, {
      layout: MailLayout.SPLIT,
    });

    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: EMAIL_ACCOUNT_ID },
      data: { mailLayout: MailLayout.SPLIT },
    });
  });
});

function createDuplicateNameError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["emailAccountId", "name"] },
  });
}
