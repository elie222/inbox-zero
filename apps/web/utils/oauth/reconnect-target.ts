import prisma from "@/utils/prisma";

/**
 * A reconnect names the mailbox it is refreshing so the provider can be asked
 * for that identity and the callback can refuse a different one. Adding an
 * account has no target and stays unconstrained.
 *
 * Without this the browser's active provider session decides which mailbox gets
 * reconnected, and signing in as a second identity silently creates a new
 * account instead of refreshing the one the user was looking at.
 */
export function findReconnectTarget({
  emailAccountId,
  userId,
  provider,
}: {
  emailAccountId: string;
  userId: string;
  provider: "google" | "microsoft";
}) {
  return prisma.emailAccount.findFirst({
    where: { id: emailAccountId, userId, account: { provider } },
    select: { id: true, email: true },
  });
}

export function isReconnectTargetMismatch({
  reconnectEmailAccountId,
  matchedEmailAccountId,
}: {
  reconnectEmailAccountId: string | null | undefined;
  matchedEmailAccountId: string | null | undefined;
}) {
  if (!reconnectEmailAccountId) return false;
  return reconnectEmailAccountId !== matchedEmailAccountId;
}
