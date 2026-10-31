import { createSenderQueue } from "./sender-queue";

// Deleting a sender removes all of their mail, not just what is still in the inbox.
const { addToQueue, clearStatuses, useSenderStatus } = createSenderQueue(
  () => ({ kind: "trash" }),
  { inboxOnly: false },
);

export const addToDeleteSenderQueue = addToQueue;
export const useDeleteSenderStatus = useSenderStatus;
export const clearDeleteSenderStatuses = clearStatuses;
