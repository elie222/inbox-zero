import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { renameGoogleEmail } from "@/utils/auth/rename-email";

vi.mock("@/utils/redis/account-validation", () => ({
  invalidateAccountValidation: vi.fn(),
}));

const userId = "email-rename-test-user";
const otherUserId = "email-rename-test-other-user";
const accountId = "email-rename-test-account";
const mailboxId = "email-rename-test-mailbox";
const input = {
  account: {
    id: accountId,
    userId,
    providerId: "google",
    accountId: "email-rename-subject",
  },
  mailbox: { id: mailboxId, email: "rename-old@example.com" },
  userEmail: "rename-old@example.com",
  profile: {
    email: "rename-new@example.com",
    sub: "email-rename-subject",
    emailVerified: true,
    hostedDomain: "example.com",
  },
};

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "email rename (real database)",
  () => {
    beforeEach(async () => {
      await prisma.user.deleteMany({
        where: { id: { in: [userId, otherUserId] } },
      });
      await prisma.user.create({
        data: { id: userId, email: input.userEmail },
      });
      await prisma.account.create({
        data: {
          id: accountId,
          userId,
          provider: "google",
          providerAccountId: input.account.accountId,
        },
      });
      await prisma.emailAccount.create({
        data: {
          id: mailboxId,
          email: input.mailbox.email,
          userId,
          accountId,
          about: "Keep these mailbox settings",
        },
      });
    });
    afterAll(async () => {
      await prisma.user.deleteMany({
        where: { id: { in: [userId, otherUserId] } },
      });
    });

    it("keeps the same user and mailbox with their settings", async () => {
      await renameGoogleEmail(input);
      expect(
        await prisma.emailAccount.findUnique({ where: { id: mailboxId } }),
      ).toMatchObject({
        userId,
        accountId,
        email: input.profile.email,
        about: "Keep these mailbox settings",
      });
      expect(
        await prisma.user.findUnique({ where: { id: userId } }),
      ).toMatchObject({ email: input.profile.email, emailVerified: true });
    });

    it("does not merge a colliding mailbox or partially rename the user", async () => {
      await prisma.user.create({
        data: { id: otherUserId, email: "rename-other@example.com" },
      });
      const otherAccount = await prisma.account.create({
        data: {
          userId: otherUserId,
          provider: "google",
          providerAccountId: "other-rename-subject",
        },
      });
      await prisma.emailAccount.create({
        data: {
          email: input.profile.email,
          userId: otherUserId,
          accountId: otherAccount.id,
        },
      });
      await expect(renameGoogleEmail(input)).rejects.toMatchObject({
        body: { code: "email_already_linked" },
      });
      expect(
        await prisma.user.findUnique({ where: { id: userId } }),
      ).toMatchObject({ email: input.userEmail });
      expect(
        await prisma.emailAccount.findUnique({ where: { id: mailboxId } }),
      ).toMatchObject({ email: input.mailbox.email, userId });
    });

    it("rolls back when the new primary email belongs to another user", async () => {
      await prisma.user.create({
        data: { id: otherUserId, email: input.profile.email },
      });
      await expect(renameGoogleEmail(input)).rejects.toMatchObject({
        body: { code: "email_already_linked" },
      });
      expect(
        await prisma.emailAccount.findUnique({ where: { id: mailboxId } }),
      ).toMatchObject({ email: input.mailbox.email });
      expect(
        await prisma.user.findUnique({ where: { id: otherUserId } }),
      ).toMatchObject({ email: input.profile.email });
    });

    it("rolls back the mailbox rename if the primary user email changed concurrently", async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { email: "rename-changed@example.com" },
      });
      await expect(renameGoogleEmail(input)).rejects.toMatchObject({
        body: { code: "email_already_linked" },
      });
      expect(
        await prisma.emailAccount.findUnique({ where: { id: mailboxId } }),
      ).toMatchObject({ email: input.mailbox.email });
      expect(
        await prisma.user.findUnique({ where: { id: userId } }),
      ).toMatchObject({ email: "rename-changed@example.com" });
    });

    it("rejects a stale ownership snapshot without taking the mailbox back", async () => {
      await prisma.user.create({
        data: { id: otherUserId, email: "rename-other@example.com" },
      });
      await prisma.account.update({
        where: { id: accountId },
        data: { userId: otherUserId },
      });
      await prisma.emailAccount.update({
        where: { id: mailboxId },
        data: { userId: otherUserId },
      });
      await expect(renameGoogleEmail(input)).rejects.toMatchObject({
        body: { code: "email_already_linked" },
      });
      expect(
        await prisma.emailAccount.findUnique({ where: { id: mailboxId } }),
      ).toMatchObject({ userId: otherUserId, email: input.mailbox.email });
      expect(
        await prisma.user.findUnique({ where: { id: userId } }),
      ).toMatchObject({ email: input.userEmail });
    });
  },
);
