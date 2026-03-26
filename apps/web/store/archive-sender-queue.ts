import { archiveEmails } from "./archive-queue";
import { createSenderQueue } from "./sender-queue";

const { addToQueue, useSenderStatus } = createSenderQueue(archiveEmails);

export const addToArchiveSenderQueue = addToQueue;
export const useArchiveSenderStatus = useSenderStatus;
