import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import {
  ActionType,
  MailLayout,
  MailSplitKind,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  createMailSplitAction,
  renameMailSplitAction,
  reorderMailSplitsAction,
  setDefaultMailSplitsAction,
  suggestMailSplitAction,
  updateMailPreferencesAction,
} from "@/utils/actions/mail-split";
import { aiPromptToSplit } from "@/utils/ai/split/prompt-to-split";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/ai/split/prompt-to-split", () => ({
  aiPromptToSplit: vi.fn(),
}));

const EMAIL_ACCOUNT_ID = "email-account-1";

const PROMPT_OPTIONS = [
  {
    id: "state:unread",
    name: "Unread",
    kind: MailSplitKind.UNREAD,
    values: [],
  },
  {
    id: "label:label-1",
    name: "Receipts",
    kind: MailSplitKind.LABEL,
    values: ["label-1"],
  },
  {
    id: "label:label-2",
    name: "Invoices",
    kind: MailSplitKind.LABEL,
    values: ["label-2"],
  },
];

describe("mail split actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { userId: "user-1", provider: "google" },
    } as never);
  });

  it.each([
    { ids: [] },
    { ids: ["split-1", "split-1"] },
  ])("rejects invalid reorder IDs: %j", async ({ ids }) => {
    const result = await reorderMailSplitsAction(EMAIL_ACCOUNT_ID, {
      ids,
    });
    expect(result?.validationErrors).toBeDefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates splits behind an account-scoped database lock", async () => {
    const split = {
      id: "split-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "Receipts",
      kind: MailSplitKind.LABEL,
      values: ["label-1"],
      order: 0,
      emailAccountId: EMAIL_ACCOUNT_ID,
    };
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      [{ status: "created", ...split }],
    ] as never);

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Receipts",
      kind: MailSplitKind.LABEL,
      values: ["label-1"],
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
    ] as never);

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Later",
      kind: MailSplitKind.LABEL,
      values: ["label-1"],
    });

    expect(result?.serverError).toBe("You can only have 14 splits.");
  });

  it("returns a user-safe error when a split name already exists", async () => {
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      [{ status: "duplicate" }],
    ] as never);

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Receipts",
      kind: MailSplitKind.LABEL,
      values: ["label-1"],
    });

    expect(result?.serverError).toBe('You already have a "Receipts" split.');
  });

  it("handles a duplicate-name constraint race with a safe error", async () => {
    prisma.$transaction.mockRejectedValue(createDuplicateNameError());

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Receipts",
      kind: MailSplitKind.LABEL,
      values: ["label-1"],
    });

    expect(result?.serverError).toBe('You already have a "Receipts" split.');
  });

  it("returns the matched options for the picker instead of creating a split", async () => {
    vi.mocked(aiPromptToSplit).mockResolvedValue({
      reasoning: "Receipts and Invoices both cover billing mail",
      optionIds: ["label:label-1", "label:label-2"],
      name: "Billing",
    });

    const result = await suggestMailSplitAction(EMAIL_ACCOUNT_ID, {
      prompt: "receipts and invoices",
      options: PROMPT_OPTIONS,
    });

    expect(result?.data).toEqual({
      optionIds: ["label:label-1", "label:label-2"],
      name: "Billing",
      reasoning: "Receipts and Invoices both cover billing mail",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // Label ids are stripped before the prompt; the AI only sees id/name/kind.
    expect(aiPromptToSplit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "receipts and invoices",
        options: [
          { id: "state:unread", name: "Unread", kind: MailSplitKind.UNREAD },
          { id: "label:label-1", name: "Receipts", kind: MailSplitKind.LABEL },
          { id: "label:label-2", name: "Invoices", kind: MailSplitKind.LABEL },
        ],
      }),
    );
  });

  it("keeps only the first option when the AI mixes a state with labels", async () => {
    vi.mocked(aiPromptToSplit).mockResolvedValue({
      reasoning: "Unread receipts",
      optionIds: ["state:unread", "label:label-1"],
      name: "Unread receipts",
    });

    const result = await suggestMailSplitAction(EMAIL_ACCOUNT_ID, {
      prompt: "unread receipts",
      options: PROMPT_OPTIONS,
    });

    expect(result?.data?.optionIds).toEqual(["state:unread"]);
  });

  it("drops options the AI invented rather than passing them to the picker", async () => {
    vi.mocked(aiPromptToSplit).mockResolvedValue({
      reasoning: "Nothing here covers mail from a specific person",
      optionIds: ["label:made-up"],
      name: "Boss",
    });

    const result = await suggestMailSplitAction(EMAIL_ACCOUNT_ID, {
      prompt: "emails from my boss",
      options: PROMPT_OPTIONS,
    });

    expect(result?.data).toEqual({
      optionIds: [],
      name: "Boss",
      reasoning: "Nothing here covers mail from a specific person",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns a user-safe error when a rename duplicates a split", async () => {
    prisma.$transaction.mockRejectedValue(createDuplicateNameError());

    const result = await renameMailSplitAction(EMAIL_ACCOUNT_ID, {
      id: "split-1",
      name: "Unread",
    });

    expect(result?.serverError).toBe('You already have a "Unread" split.');
  });

  it("returns a user-safe error instead of partially adding defaults", async () => {
    prisma.rule.findMany.mockResolvedValue([
      {
        systemType: SystemType.RECEIPT,
        actions: [{ type: ActionType.LABEL, labelId: "receipt-label" }],
      },
      {
        systemType: SystemType.NEWSLETTER,
        actions: [{ type: ActionType.LABEL, labelId: "newsletter-label" }],
      },
    ] as never);
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      [{ availableCount: 1, missingCount: 2 }],
    ] as never);

    const result = await setDefaultMailSplitsAction(EMAIL_ACCOUNT_ID, {
      enabled: true,
    });

    expect(result?.serverError).toBe("You can only have 14 splits.");
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
