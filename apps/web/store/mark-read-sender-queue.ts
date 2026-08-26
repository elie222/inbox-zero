import { createSenderQueue } from "./sender-queue";

const { addToQueue, useSenderStatus } = createSenderQueue(() => ({
  kind: "set_read_state",
  read: true,
}));

export const addToMarkReadSenderQueue = addToQueue;
export const useMarkReadSenderStatus = useSenderStatus;
