import { createSenderQueue } from "./sender-queue";

const { addToQueue, clearStatuses, useSenderStatus } = createSenderQueue(
  () => ({
    kind: "set_read_state",
    read: true,
  }),
);

export const addToMarkReadSenderQueue = addToQueue;
export const useMarkReadSenderStatus = useSenderStatus;
export const clearMarkReadSenderStatuses = clearStatuses;
