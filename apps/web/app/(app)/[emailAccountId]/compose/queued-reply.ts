import type { SendEmailBody } from "@/utils/types/mail";
import {
  claimMailMutationNotification,
  enqueueMailMutation,
  getMailMutation,
  subscribeToMailMutations,
} from "@/utils/email-cache/mail-mutations";

const DEFAULT_SETTLEMENT_TIMEOUT_MS = 15_000;

export type ReaderEmailOutcome =
  | { status: "sent"; messageId: string; threadId: string }
  | {
      status: "queued";
      reason: "offline" | "pending" | "blocked_auth";
      threadId: string;
    }
  | { status: "uncertain"; ownsNotification: boolean; threadId: string }
  | { status: "failed"; error: string; ownsNotification: boolean };

export async function queueReaderEmail({
  email,
  emailAccountId,
  messageIds,
  online,
  settlementTimeoutMs = DEFAULT_SETTLEMENT_TIMEOUT_MS,
  threadId,
}: {
  email: SendEmailBody;
  emailAccountId: string;
  messageIds: string[];
  online: boolean;
  settlementTimeoutMs?: number;
  threadId: string;
}): Promise<ReaderEmailOutcome> {
  const mutation = await enqueueMailMutation({
    email,
    emailAccountId,
    kind: "reply",
    messageIds,
    threadId,
  });
  if (!online) return { status: "queued", reason: "offline", threadId };

  return waitForSettlement({
    mutationId: mutation.id,
    settlementTimeoutMs,
    threadId,
  });
}

async function waitForSettlement({
  mutationId,
  settlementTimeoutMs,
  threadId,
}: {
  mutationId: string;
  settlementTimeoutMs: number;
  threadId: string;
}): Promise<ReaderEmailOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let inspecting = false;
    let inspectAgain = false;
    const finish = (outcome: ReaderEmailOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      resolve(outcome);
    };
    const inspect = async () => {
      if (settled) return;
      if (inspecting) {
        inspectAgain = true;
        return;
      }
      inspecting = true;
      try {
        const mutation = await getMailMutation(mutationId);
        if (!mutation) {
          finish({
            status: "failed",
            error: "Queued email was not found",
            ownsNotification: true,
          });
          return;
        }
        if (mutation.status === "succeeded") {
          const result = parseSendResult(mutation.result);
          finish({
            status: "sent",
            messageId: result?.messageId ?? "",
            threadId: result?.threadId ?? threadId,
          });
        } else if (mutation.status === "failed") {
          const claimed = await claimMailMutationNotification(mutationId);
          finish({
            status: "failed",
            error:
              claimed?.lastError ??
              mutation.lastError ??
              "There was an error sending the email",
            ownsNotification: Boolean(claimed),
          });
        } else if (mutation.status === "uncertain") {
          const claimed = await claimMailMutationNotification(mutationId);
          finish({
            status: "uncertain",
            ownsNotification: Boolean(claimed),
            threadId,
          });
        } else if (mutation.status === "blocked_auth") {
          finish({ status: "queued", reason: "blocked_auth", threadId });
        }
      } catch {
        // A later outbox notification or the timeout gets another chance to
        // observe settlement; an IndexedDB hiccup must not reject submission.
      } finally {
        inspecting = false;
        if (inspectAgain) {
          inspectAgain = false;
          inspect();
        }
      }
    };
    const unsubscribe = subscribeToMailMutations(inspect);
    const timeout = setTimeout(
      () => finish({ status: "queued", reason: "pending", threadId }),
      settlementTimeoutMs,
    );
    inspect();
  });
}

function parseSendResult(result: unknown) {
  if (!result || typeof result !== "object") return;
  const { messageId, threadId } = result as Record<string, unknown>;
  if (typeof messageId !== "string" || typeof threadId !== "string") return;
  return { messageId, threadId };
}
