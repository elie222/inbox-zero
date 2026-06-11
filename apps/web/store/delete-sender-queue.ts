import { deleteEmails } from "./archive-queue";
import { createSenderQueue } from "./sender-queue";

const { addToQueue, useSenderStatus } = createSenderQueue(deleteEmails);

export const addToDeleteSenderQueue = addToQueue;
export const useDeleteSenderStatus = useSenderStatus;
