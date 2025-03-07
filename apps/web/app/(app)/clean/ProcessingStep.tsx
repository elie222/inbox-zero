import { EmailFirehose } from "@/app/(app)/clean/EmailFirehose";
import { getThreads } from "@/utils/redis/clean";

export async function ProcessingStep({ userId }: { userId: string }) {
  const threads = await getThreads(userId);

  return (
    <EmailFirehose threads={threads.filter((t) => t.status !== "processing")} />
  );
}
