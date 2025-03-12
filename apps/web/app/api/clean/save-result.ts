import prisma from "@/utils/prisma";
import { updateThread } from "@/utils/redis/clean";

export async function saveCleanResult({
  userId,
  threadId,
  markDone,
  jobId,
}: {
  userId: string;
  threadId: string;
  markDone: boolean;
  jobId: string;
}) {
  await Promise.all([
    updateThread(userId, jobId, threadId, { status: "completed" }),
    saveToDatabase({
      userId,
      threadId,
      archive: markDone,
      jobId,
    }),
  ]);
}

async function saveToDatabase({
  userId,
  threadId,
  archive,
  jobId,
}: {
  userId: string;
  threadId: string;
  archive: boolean;
  jobId: string;
}) {
  await prisma.cleanupThread.create({
    data: {
      userId,
      threadId,
      archived: archive,
      jobId,
    },
  });
}
