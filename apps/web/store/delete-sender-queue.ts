import { createSenderQueue } from "./sender-queue";

const { addToQueue, useSenderStatus } = createSenderQueue(() => ({
  kind: "trash",
}));

export const addToDeleteSenderQueue = addToQueue;
export const useDeleteSenderStatus = useSenderStatus;
