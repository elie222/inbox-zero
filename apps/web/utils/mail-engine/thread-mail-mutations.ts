import { getActiveMailClient } from "@/utils/mail-engine/active-client";
import {
  mutationPayloadToChange,
  type ThreadMutationPayload,
} from "@/utils/mail-engine/mutation-change";
import { submitConversationChange } from "@/utils/mail-engine/submit-conversations";
import { randomUuid } from "@/utils/uuid";

type ThreadMailMutationTarget = {
  id: string;
  messages: readonly { id: string }[];
};

export type ThreadMailMutation = ThreadMutationPayload & {
  id: string;
  batchId: string;
  clientSource?: { kind: "sender"; sender: string };
  emailAccountId: string;
  threadId: string;
  messageIds: string[];
  status: "succeeded";
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
};

export async function enqueueThreadMailMutationBatch(
  {
    batchId = randomUuid(),
    clientSource,
    emailAccountId,
    payload,
    threads,
  }: {
    batchId?: string;
    clientSource?: { kind: "sender"; sender: string };
    emailAccountId: string;
    payload: ThreadMutationPayload;
    threads: readonly ThreadMailMutationTarget[];
  },
  now = Date.now(),
) {
  const targets = threads.map((thread) => {
    const messageIds = [
      ...new Set(thread.messages.map((message) => message.id)),
    ];
    if (!thread.id || messageIds.length === 0 || messageIds.some((id) => !id)) {
      throw new Error(
        `Cannot queue mail mutation without a complete snapshot for thread ${thread.id || "unknown"}`,
      );
    }
    return { messageIds, threadId: thread.id };
  });
  if (!targets.length)
    return { batchId, mutations: [] as ThreadMailMutation[] };

  const client = getActiveMailClient();
  if (!client) {
    throw new Error("Mail engine is unavailable");
  }
  const change = mutationPayloadToChange(payload);
  if (!change) {
    throw new Error("Unsupported mail mutation");
  }

  const mutations: ThreadMailMutation[] = [];
  for (const target of targets) {
    const { admission, commandId } = await submitConversationChange({
      accountId: emailAccountId,
      change,
      client,
      conversationId: target.threadId,
    });
    if (admission.status === "rejected") continue;
    mutations.push({
      id: commandId,
      batchId,
      clientSource,
      emailAccountId,
      threadId: target.threadId,
      messageIds: target.messageIds,
      ...payload,
      status: "succeeded",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { batchId, mutations };
}
