import { atom } from "jotai";
import pRetry from "p-retry";
import { jotaiStore } from "@/store";
import { exponentialBackoff } from "@/utils/sleep";
import { sleep } from "@/utils/sleep";
import { isActionError } from "@/utils/error";
import { categorizeSenderAction } from "@/utils/actions/categorize";
import { aiQueue } from "@/utils/queue/ai-queue";

export const aiCategorizeSenderQueueAtom = atom<Set<string>>(new Set([]));

export const pushToAiCategorizeSenderQueueAtom = (pushIds: string[]) => {
  jotaiStore.set(aiCategorizeSenderQueueAtom, (prev) => {
    const newIds = new Set(prev);
    pushIds.forEach((id) => newIds.add(id));
    return newIds;
  });

  processAiCategorizeSenderQueue({ senders: pushIds });
};

const removeFromAiCategorizeSenderQueueAtom = (removeId: string) => {
  jotaiStore.set(aiCategorizeSenderQueueAtom, (prev) => {
    const remainingSenders = new Set(prev);
    remainingSenders.delete(removeId);
    return remainingSenders;
  });
};

export const createInAiCategorizeSenderQueueSelector = (id: string) => {
  return atom((get) => {
    const ids = get(aiCategorizeSenderQueueAtom);
    return ids.has(id);
  });
};

export const isAiCategorizeSenderQueueEmptySelector = atom((get) => {
  const ids = get(aiCategorizeSenderQueueAtom);
  return ids.size === 0;
});

function processAiCategorizeSenderQueue({ senders }: { senders: string[] }) {
  const tasks = senders.map((sender) => async () => {
    await pRetry(
      async (attemptCount) => {
        console.log(
          `Queue: aiCategorizeSender. Processing ${sender}` +
            (attemptCount > 1 ? ` (attempt ${attemptCount})` : ""),
        );

        const result = await categorizeSenderAction(sender);

        // when API returns a rate limit error, throw an error so it can be retried
        if (isActionError(result)) {
          await sleep(exponentialBackoff(attemptCount, 1_000));
          throw new Error(result.error);
        }
      },
      { retries: 3 },
    );

    removeFromAiCategorizeSenderQueueAtom(sender);
  });

  aiQueue.addAll(tasks);
}
