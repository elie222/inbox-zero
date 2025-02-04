import { deleteContact as deleteLoopsContact } from "@inboxzero/loops";
import { deleteContact as deleteResendContact } from "@inboxzero/resend";
import prisma from "@/utils/prisma";
import { deleteInboxZeroLabels, deleteUserLabels } from "@/utils/redis/label";
import { deleteUserStats } from "@/utils/redis/stats";
import { deleteTinybirdEmails } from "@inboxzero/tinybird";
import { deleteTinybirdAiCalls } from "@inboxzero/tinybird-ai-analytics";
import { deletePosthogUser } from "@/utils/posthog";
import { captureException } from "@/utils/error";
import { unwatchEmails } from "@/app/api/google/watch/controller";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("user/delete");

export async function deleteUser({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true },
  });
  if (!account) return;

  const results = await Promise.allSettled([
    deleteUserLabels({ email }),
    deleteInboxZeroLabels({ email }),
    deleteUserStats({ email }),
    deleteTinybirdEmails({ email }),
    deleteTinybirdAiCalls({ userId }),
    deletePosthogUser({ email }),
    deleteLoopsContact(email),
    deleteResendContact({ email }),
    unwatchEmails({
      userId: userId,
      access_token: account.access_token ?? null,
      refresh_token: null,
    }),
  ]);

  // Log any failures
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    logger.error("Some deletion operations failed", {
      email,
      userId,
      failures: failures.map((f) => (f as PromiseRejectedResult).reason),
    });
    captureException(
      (failures[0] as PromiseRejectedResult)?.reason,
      { extra: { failures } },
      email,
    );
  }

  await prisma.user.delete({ where: { email } });
}
