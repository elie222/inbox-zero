import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { renameGoogleEmail } from "@/utils/auth/rename-email";
import prisma from "@/utils/__mocks__/prisma";
import { invalidateAccountValidation } from "@/utils/redis/account-validation";

vi.mock("@/utils/prisma");
vi.mock("@/utils/redis/account-validation", () => ({
  invalidateAccountValidation: vi.fn(),
}));

const input = {
  account: {
    id: "account",
    userId: "user",
    providerId: "google",
    accountId: "subject",
  },
  mailbox: { id: "mailbox", email: "old@example.com" },
  userEmail: "old@example.com",
  profile: {
    email: "new@example.com",
    sub: "subject",
    emailVerified: true,
    hostedDomain: "example.com",
  },
};

describe("renameGoogleEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockResolvedValue([]);
  });

  it("does no database work when the address is unchanged", async () => {
    await renameGoogleEmail({
      ...input,
      profile: { ...input.profile, email: input.mailbox.email },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    {
      providerId: "microsoft",
      sub: "subject",
      emailVerified: true,
      hostedDomain: "example.com",
    },
    {
      providerId: "google",
      sub: "other-subject",
      emailVerified: true,
      hostedDomain: "example.com",
    },
    {
      providerId: "google",
      sub: "subject",
      emailVerified: false,
      hostedDomain: "example.com",
    },
    {
      providerId: "google",
      sub: "subject",
      emailVerified: undefined,
      hostedDomain: "example.com",
    },
    {
      providerId: "google",
      sub: "subject",
      emailVerified: true,
      hostedDomain: undefined,
    },
  ])("does not rename without authoritative matching identity: %j", async ({
    providerId,
    ...profile
  }) => {
    await renameGoogleEmail({
      ...input,
      account: { ...input.account, providerId },
      profile: { ...input.profile, ...profile },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    { email: "new@example.com", hostedDomain: "example.com" },
    { email: "new@gmail.com", hostedDomain: undefined },
  ])("updates the primary login and clears mailbox cache for $email", async (profile) => {
    expect(
      await renameGoogleEmail({
        ...input,
        profile: { ...input.profile, ...profile },
      }),
    ).toEqual({
      id: "mailbox",
      renamedUser: { userId: "user", email: profile.email },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user", email: "old@example.com" },
      data: { email: profile.email, emailVerified: true },
    });
    expect(prisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "mailbox",
          email: "old@example.com",
          userId: "user",
          accountId: "account",
          account: {
            userId: "user",
            provider: "google",
            providerAccountId: "subject",
          },
        },
      }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(invalidateAccountValidation).toHaveBeenCalledWith({
      userId: "user",
      emailAccountId: "mailbox",
    });
  });

  it("does not change the primary login when renaming a secondary mailbox", async () => {
    expect(
      await renameGoogleEmail({ ...input, userEmail: "primary@example.com" }),
    ).toEqual({ id: "mailbox", renamedUser: undefined });
    expect(prisma.emailAccount.update).toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses an email claimed by a different user", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "other-user" } as any);
    await expect(
      renameGoogleEmail({ ...input, userEmail: "primary@example.com" }),
    ).rejects.toMatchObject({
      body: { code: "email_already_linked" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    "P2002",
    "P2025",
  ])("fails safely on a database conflict (%s)", async (code) => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("conflict", {
        code,
        clientVersion: "test",
      }),
    );
    await expect(renameGoogleEmail(input)).rejects.toMatchObject({
      body: { code: "email_already_linked" },
    });
    expect(invalidateAccountValidation).not.toHaveBeenCalled();
  });
});
