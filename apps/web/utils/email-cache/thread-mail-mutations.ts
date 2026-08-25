import {
  enqueueMailMutationBatch,
  type MailMutationPayload,
} from "./mail-mutations";
import type { MailMutationClientSource } from "./database";

type ThreadMailMutationTarget = {
  id: string;
  messages: readonly { id: string }[];
};

export async function enqueueThreadMailMutationBatch(
  {
    batchId = crypto.randomUUID(),
    clientSource,
    emailAccountId,
    payload,
    threads,
  }: {
    batchId?: string;
    clientSource?: MailMutationClientSource;
    emailAccountId: string;
    payload: MailMutationPayload;
    threads: readonly ThreadMailMutationTarget[];
  },
  now = Date.now(),
) {
  const targets = threads.map((thread) => {
    const messageIds = thread.messages.map((message) => message.id);
    if (!thread.id || messageIds.length === 0 || messageIds.some((id) => !id)) {
      throw new Error(
        `Cannot queue mail mutation without a complete snapshot for thread ${thread.id || "unknown"}`,
      );
    }
    return {
      ...payload,
      batchId,
      clientSource,
      emailAccountId,
      messageIds,
      threadId: thread.id,
    };
  });
  const mutations = await enqueueMailMutationBatch(targets, now);
  return { batchId, mutations };
}
