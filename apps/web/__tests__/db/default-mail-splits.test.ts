import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { MailSplitKind } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import {
  createMailSplit,
  removeLabelFromMailSplits,
  reorderMailSplits,
} from "@/utils/mail/splits.server";
import { setDefaultMailSplits } from "@/utils/mail/default-splits.server";

const RUN_DB_TESTS = process.env.RUN_DB_TESTS;

describe.skipIf(!RUN_DB_TESTS)(
  "default mail splits (real database)",
  { timeout: 30_000 },
  () => {
    let emailAccountId: string;

    const accountEmail = "default-mail-splits-test@example.com";

    beforeEach(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });

      const user = await prisma.user.create({ data: { email: accountEmail } });
      const account = await prisma.account.create({
        data: {
          userId: user.id,
          provider: "google",
          providerAccountId: accountEmail,
          type: "oauth",
        },
      });
      const emailAccount = await prisma.emailAccount.create({
        data: { email: accountEmail, userId: user.id, accountId: account.id },
      });
      emailAccountId = emailAccount.id;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });
    });

    test("stores, deletes, and restores inbox and unread splits as rows", async () => {
      for (const kind of [MailSplitKind.INBOX, MailSplitKind.UNREAD]) {
        const draft = { emailAccountId, name: kind, kind, values: [] };
        expect((await createMailSplit(draft))?.status).toBe("created");
        await prisma.mailSplit.deleteMany({ where: { emailAccountId, kind } });
        expect(
          await prisma.mailSplit.count({ where: { emailAccountId, kind } }),
        ).toBe(0);
        expect((await createMailSplit(draft))?.status).toBe("created");
      }
      expect(await prisma.mailSplit.count({ where: { emailAccountId } })).toBe(
        2,
      );
    });

    test("reorders every kind while keeping omitted rows and ignoring stale IDs", async () => {
      const rows = [];
      for (const kind of [
        MailSplitKind.INBOX,
        MailSplitKind.UNREAD,
        MailSplitKind.LABEL,
      ]) {
        const row = await createMailSplit({
          emailAccountId,
          name: kind,
          kind,
          values: kind === MailSplitKind.LABEL ? ["label-1"] : [],
        });
        if (row?.status !== "created") throw new Error("Could not seed split");
        rows.push(row);
      }
      await reorderMailSplits({
        emailAccountId,
        ids: [rows[2].id, "deleted", rows[0].id],
      });
      const reordered = await prisma.mailSplit.findMany({
        where: { emailAccountId },
        orderBy: { order: "asc" },
      });
      expect(reordered.map(({ id }) => id)).toEqual([
        rows[2].id,
        rows[1].id,
        rows[0].id,
      ]);
      expect(reordered.map(({ order }) => order)).toEqual([0, 1, 2]);
      await reorderMailSplits({
        emailAccountId: "another-account",
        ids: rows.map(({ id }) => id),
      });
      expect(
        await prisma.mailSplit.findMany({
          where: { emailAccountId },
          orderBy: { order: "asc" },
        }),
      ).toEqual(reordered);
      await Promise.all([
        reorderMailSplits({
          emailAccountId,
          ids: [rows[1].id, rows[2].id, rows[0].id],
        }),
        createMailSplit({
          emailAccountId,
          name: "New",
          kind: MailSplitKind.LABEL,
          values: ["new-label"],
        }),
      ]);
      const concurrent = await prisma.mailSplit.findMany({
        where: { emailAccountId },
        orderBy: { order: "asc" },
      });
      expect(concurrent.map(({ name }) => name)).toEqual([
        "UNREAD",
        "LABEL",
        "INBOX",
        "New",
      ]);
      expect(concurrent.map(({ order }) => order)).toEqual([0, 1, 2, 3]);
    });

    // The insert goes through raw SQL, so the array parameter needs a real
    // database to prove it lands as a Postgres text[] rather than a string.
    test("stores every label of a multi-label split", async () => {
      const result = await createMailSplit({
        emailAccountId,
        name: "Feedback",
        kind: MailSplitKind.LABEL,
        values: ["label-users", "label-customers"],
      });

      expect(result?.status).toBe("created");
      const saved = await prisma.mailSplit.findFirst({
        where: { emailAccountId, name: "Feedback" },
      });
      expect(saved?.values).toEqual(["label-users", "label-customers"]);
    });

    test("adds and removes rule-label defaults without touching a widened split", async () => {
      const defaultSplits = [
        {
          name: "Receipt",
          kind: MailSplitKind.LABEL,
          values: ["receipt-label"],
        },
      ];
      await setDefaultMailSplits({
        emailAccountId,
        defaultSplits,
        enabled: true,
      });
      const afterEnable = await prisma.mailSplit.findMany({
        where: { emailAccountId },
        select: { name: true },
      });
      expect(afterEnable.map((split) => split.name)).toEqual(["Receipt"]);

      await createMailSplit({
        emailAccountId,
        name: "Receipts and invoices",
        kind: MailSplitKind.LABEL,
        values: ["receipt-label", "invoice-label"],
      });

      await setDefaultMailSplits({
        emailAccountId,
        defaultSplits,
        enabled: false,
      });

      const remaining = await prisma.mailSplit.findMany({
        where: { emailAccountId },
      });
      expect(remaining.map((split) => split.name)).toEqual([
        "Receipts and invoices",
      ]);
    });

    test("narrows splits that share a deleted label and drops the ones left empty", async () => {
      await createMailSplit({
        emailAccountId,
        name: "Feedback",
        kind: MailSplitKind.LABEL,
        values: ["gone"],
      });
      await createMailSplit({
        emailAccountId,
        name: "Feedback and support",
        kind: MailSplitKind.LABEL,
        values: ["gone", "kept"],
      });

      await removeLabelFromMailSplits({ emailAccountId, labelId: "gone" });

      const remaining = await prisma.mailSplit.findMany({
        where: { emailAccountId },
        select: { name: true, values: true },
      });
      expect(remaining).toEqual([
        { name: "Feedback and support", values: ["kept"] },
      ]);
    });
  },
);
