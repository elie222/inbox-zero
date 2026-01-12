import { markReadThreads } from "./archive-queue";
import { createSenderQueue } from "./sender-queue";

const { addToQueue, useSenderStatus } = createSenderQueue(markReadThreads);

export const addToMarkReadSenderQueue = addToQueue;
export const useMarkReadSenderStatus = useSenderStatus;
