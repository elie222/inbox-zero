import { enqueueBullmqHttpJob } from "@/utils/queue/bullmq";

export async function enqueueFastmailSync(emailAccountId: string) {
  await enqueueBullmqHttpJob({
    queueName: "fastmail-sync",
    path: "/api/fastmail/process",
    body: { emailAccountId },
  });
}
