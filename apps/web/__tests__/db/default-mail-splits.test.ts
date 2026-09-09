import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
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
      for (const kind of ["INBOX", MailSplitFilterKind.UNREAD]) {
        const draft = {
          emailAccountId,
          name: kind,
          matchAll: true,
          filters:
            kind === "INBOX"
              ? []
              : [{ kind: MailSplitFilterKind.UNREAD, value: null }],
        };
        expect((await createMailSplit(draft))?.status).toBe("created");
        await prisma.mailSplit.deleteMany({
          where: { emailAccountId, name: kind },
        });
        expect(
          await prisma.mailSplit.count({
            where: { emailAccountId, name: kind },
          }),
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
        "INBOX",
        MailSplitFilterKind.UNREAD,
        MailSplitFilterKind.LABEL,
      ] as const) {
        const row = await createMailSplit({
          emailAccountId,
          name: kind,
          matchAll: true,
          filters:
            kind === "INBOX"
              ? []
              : [
                  {
                    kind,
                    value:
                      kind === MailSplitFilterKind.LABEL ? "label-1" : null,
                  },
                ],
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
          matchAll: false,
          filters: ["new-label"].map((value) => ({
            kind: MailSplitFilterKind.LABEL,
            value,
          })),
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

    test("stores every label of a multi-label split", async () => {
      const result = await createMailSplit({
        emailAccountId,
        name: "Feedback",
        matchAll: false,
        filters: ["label-users", "label-customers"].map((value) => ({
          kind: MailSplitFilterKind.LABEL,
          value,
        })),
      });

      expect(result?.status).toBe("created");
      const saved = await prisma.mailSplit.findFirst({
        where: { emailAccountId, name: "Feedback" },
        include: { filters: { orderBy: { order: "asc" } } },
      });
      expect(saved?.filters.map((filter) => filter.value)).toEqual([
        "label-users",
        "label-customers",
      ]);
    });

    test("adds and removes rule-label defaults without touching a widened split", async () => {
      const defaultSplits = [
        {
          name: "Receipt",
          labelId: "receipt-label",
          filters: [
            { kind: MailSplitFilterKind.LABEL, value: "receipt-label" },
          ],
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
        matchAll: false,
        filters: ["receipt-label", "invoice-label"].map((value) => ({
          kind: MailSplitFilterKind.LABEL,
          value,
        })),
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
        matchAll: false,
        filters: ["gone"].map((value) => ({
          kind: MailSplitFilterKind.LABEL,
          value,
        })),
      });
      await createMailSplit({
        emailAccountId,
        name: "Feedback and support",
        matchAll: false,
        filters: ["gone", "kept"].map((value) => ({
          kind: MailSplitFilterKind.LABEL,
          value,
        })),
      });

      await removeLabelFromMailSplits({ emailAccountId, labelId: "gone" });

      const remaining = await prisma.mailSplit.findMany({
        where: { emailAccountId },
        select: { name: true, filters: { select: { value: true } } },
      });
      expect(remaining).toEqual([
        { name: "Feedback and support", filters: [{ value: "kept" }] },
      ]);
    });
  },
);
