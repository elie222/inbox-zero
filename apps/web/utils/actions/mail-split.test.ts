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
  createMailSplitFromPromptAction,
  renameMailSplitAction,
  setDefaultMailSplitsAction,
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
    value: null,
  },
  {
    id: "label:label-1",
    name: "Receipts",
    kind: MailSplitKind.LABEL,
    value: "label-1",
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

  it("creates splits behind an account-scoped database lock", async () => {
    const split = {
      id: "split-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "Unread",
      kind: MailSplitKind.UNREAD,
      value: null,
      order: 0,
      emailAccountId: EMAIL_ACCOUNT_ID,
    };
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      [{ status: "created", ...split }],
    ] as never);

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Unread",
      kind: MailSplitKind.UNREAD,
      value: null,
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
      kind: MailSplitKind.UNREAD,
      value: null,
    });

    expect(result?.serverError).toBe("You can only have 12 splits.");
  });

  it("returns a user-safe error when a split name already exists", async () => {
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      [{ status: "duplicate" }],
    ] as never);

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Unread",
      kind: MailSplitKind.UNREAD,
      value: null,
    });

    expect(result?.serverError).toBe('You already have a "Unread" split.');
  });

  it("handles a duplicate-name constraint race with a safe error", async () => {
    prisma.$transaction.mockRejectedValue(createDuplicateNameError());

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Unread",
      kind: MailSplitKind.UNREAD,
      value: null,
    });

    expect(result?.serverError).toBe('You already have a "Unread" split.');
  });

  it("creates the split the AI matched from a description", async () => {
    vi.mocked(aiPromptToSplit).mockResolvedValue({
      reasoning: "Receipts filters for what the user described",
      optionId: "label:label-1",
      name: "Receipts",
    });
    const split = {
      id: "split-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "Receipts",
      kind: MailSplitKind.LABEL,
      value: "label-1",
      order: 0,
      emailAccountId: EMAIL_ACCOUNT_ID,
    };
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      [{ status: "created", ...split }],
    ] as never);

    const result = await createMailSplitFromPromptAction(EMAIL_ACCOUNT_ID, {
      prompt: "my receipts",
      options: PROMPT_OPTIONS,
    });

    expect(result?.data).toEqual({ split });
    // Label ids are stripped before the prompt; the AI only sees id/name/kind.
    expect(aiPromptToSplit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "my receipts",
        options: [
          { id: "state:unread", name: "Unread", kind: MailSplitKind.UNREAD },
          { id: "label:label-1", name: "Receipts", kind: MailSplitKind.LABEL },
        ],
      }),
    );
  });

  it("returns a user-safe error when the AI response isn't one of the options", async () => {
    vi.mocked(aiPromptToSplit).mockResolvedValue({
      reasoning: "Invented an option that does not exist",
      optionId: "label:made-up",
      name: "Boss",
    });

    const result = await createMailSplitFromPromptAction(EMAIL_ACCOUNT_ID, {
      prompt: "emails from my boss",
      options: PROMPT_OPTIONS,
    });

    expect(result?.serverError).toBe(
      "Couldn't match that to a label or category. Try different wording, or pick one from the list.",
    );
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

    expect(result?.serverError).toBe("You can only have 12 splits.");
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
