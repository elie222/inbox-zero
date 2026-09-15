import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { createScopedLogger } from "@/utils/logger";
import type { MicrosoftIdTokenClaims } from "@/utils/microsoft/oauth";

const logger = createScopedLogger("auth/microsoft-account-subject");

/**
 * better-auth keyed Microsoft accounts on the id_token `sub` claim until v1.7,
 * then switched to `oid`. Accounts stored before that upgrade still hold `sub`,
 * so a lookup by `oid` misses them, falls through to matching on email, and
 * fails sign-in with `account_not_linked`.
 *
 * Re-key them to `oid` the next time the same Entra identity authenticates.
 * Both claims come from one id_token, so the row being rewritten is the same
 * identity that just signed in.
 */
export async function reconcileMicrosoftAccountSubject({
  oid,
  sub,
}: MicrosoftIdTokenClaims) {
  if (!oid || !sub || oid === sub) return;

  const legacyAccount = await findMicrosoftAccount(sub);
  if (!legacyAccount) return;

  // A row already under the current key means the legacy row is a duplicate.
  // Merging those is a user-facing decision, so leave both in place.
  const currentAccount = await findMicrosoftAccount(oid);
  if (currentAccount) return;

  try {
    await prisma.account.update({
      where: { id: legacyAccount.id },
      data: { providerAccountId: oid },
    });
  } catch (error) {
    if (isDuplicateError(error)) return;
    throw error;
  }

  logger.info("Re-keyed Microsoft account to the Entra object id", {
    accountId: legacyAccount.id,
    userId: legacyAccount.userId,
  });
}

function findMicrosoftAccount(providerAccountId: string) {
  return prisma.account.findUnique({
    where: {
      provider_providerAccountId: { provider: "microsoft", providerAccountId },
    },
    select: { id: true, userId: true },
  });
}
