import { APIError, type Account } from "better-auth";
import prisma from "@/utils/prisma";
import { isDuplicateError, isNotFoundError } from "@/utils/prisma-helpers";
import { assertAllowedAuthSignupEmail } from "@/utils/auth-signup-policy";
import { invalidateAccountValidation } from "@/utils/redis/account-validation";

export async function renameGoogleEmail({
  account,
  mailbox,
  userEmail,
  profile,
}: {
  account: Pick<Account, "id" | "userId" | "providerId" | "accountId">;
  mailbox: { id: string; email: string };
  userEmail: string;
  profile: {
    email: string;
    sub?: string;
    emailVerified?: boolean;
    hostedDomain?: string;
    name?: string | null;
    image?: string | null;
  };
}) {
  const email = profile.email.trim().toLowerCase();
  if (email === mailbox.email) return;

  // Google is not authoritative for third-party email addresses, even when
  // email_verified is true. Microsoft profile emails are not identity proofs.
  if (
    account.providerId !== "google" ||
    profile.sub !== account.accountId ||
    profile.emailVerified !== true ||
    !(email.endsWith("@gmail.com") || profile.hostedDomain)
  ) {
    return;
  }
  assertAllowedAuthSignupEmail(email);

  const isPrimary = userEmail === mailbox.email;
  // Secondary-mailbox updates do not touch User.email, so its unique
  // constraint cannot catch a conflicting login owned by another user.
  if (!isPrimary) {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser && existingUser.id !== account.userId) {
      throw APIError.from("BAD_REQUEST", {
        code: "email_already_linked",
        message: "email_already_linked",
      });
    }
  }

  try {
    await prisma.$transaction([
      prisma.emailAccount.update({
        where: {
          id: mailbox.id,
          email: mailbox.email,
          userId: account.userId,
          accountId: account.id,
          account: {
            userId: account.userId,
            provider: "google",
            providerAccountId: account.accountId,
          },
        },
        data: { email, name: profile.name, image: profile.image },
      }),
      prisma.account.update({
        where: {
          id: account.id,
          userId: account.userId,
          provider: "google",
          providerAccountId: account.accountId,
        },
        data: { disconnectedAt: null },
      }),
      ...(isPrimary
        ? [
            prisma.user.update({
              where: { id: account.userId, email: userEmail },
              data: { email, emailVerified: true },
            }),
          ]
        : []),
    ]);
  } catch (error) {
    if (isDuplicateError(error) || isNotFoundError(error)) {
      throw APIError.from("BAD_REQUEST", {
        code: "email_already_linked",
        message: "email_already_linked",
      });
    }
    throw error;
  }

  await invalidateAccountValidation({
    userId: account.userId,
    emailAccountId: mailbox.id,
  });
  return {
    id: mailbox.id,
    renamedUser: isPrimary ? { userId: account.userId, email } : undefined,
  };
}
