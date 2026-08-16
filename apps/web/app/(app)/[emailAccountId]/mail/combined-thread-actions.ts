import { mapWithConcurrency } from "@/utils/async";

const THREAD_ACTION_CONCURRENCY = 10;

type CombinedActionThread = {
  id: string;
  account: { id: string };
};

export async function runCombinedThreadAction({
  threads,
  action,
}: {
  threads: CombinedActionThread[];
  action: (emailAccountId: string, threadId: string) => Promise<unknown>;
}) {
  const results = await mapWithConcurrency(
    threads,
    THREAD_ACTION_CONCURRENCY,
    async (thread) => {
      const threadKey = `${thread.account.id}:${thread.id}`;
      try {
        const result = await action(thread.account.id, thread.id);
        return { failed: isActionError(result), threadKey };
      } catch {
        return { failed: true, threadKey };
      }
    },
  );

  return {
    failedThreadKeys: results
      .filter((result) => result.failed)
      .map((result) => result.threadKey),
    succeededThreadKeys: results
      .filter((result) => !result.failed)
      .map((result) => result.threadKey),
  };
}

function isActionError(result: unknown) {
  return (
    isRecord(result) &&
    (Boolean(result.serverError) || Boolean(result.validationErrors))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
