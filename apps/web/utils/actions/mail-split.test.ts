import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { MailSplitKind } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  createMailSplitAction,
  renameMailSplitAction,
} from "@/utils/actions/mail-split";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const EMAIL_ACCOUNT_ID = "email-account-1";

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
      [split],
      split,
      1,
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
      [],
      null,
      12,
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
      [],
      { id: "existing-split" },
      1,
    ] as never);

    const result = await createMailSplitAction(EMAIL_ACCOUNT_ID, {
      name: "Unread",
      kind: MailSplitKind.UNREAD,
      value: null,
    });

    expect(result?.serverError).toBe('You already have a "Unread" split.');
  });

  it("returns a user-safe error when a rename duplicates a split", async () => {
    prisma.mailSplit.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["emailAccountId", "name"] },
      }),
    );

    const result = await renameMailSplitAction(EMAIL_ACCOUNT_ID, {
      id: "split-1",
      name: "Unread",
    });

    expect(result?.serverError).toBe('You already have a "Unread" split.');
  });
});
