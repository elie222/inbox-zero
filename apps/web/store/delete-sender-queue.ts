import { createSenderQueue } from "./sender-queue";

const { addToQueue, clearStatuses, useSenderStatus } = createSenderQueue(
  () => ({
    kind: "trash",
  }),
);

export const addToDeleteSenderQueue = addToQueue;
export const useDeleteSenderStatus = useSenderStatus;
export const clearDeleteSenderStatuses = clearStatuses;
