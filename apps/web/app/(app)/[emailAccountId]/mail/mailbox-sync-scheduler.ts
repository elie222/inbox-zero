type MailboxSyncResult = { hasMore: boolean; pagesSynced: number };

type ScheduledSync = {
  emailAccountId: string;
  priority: boolean;
  queued: boolean;
  result: ReturnType<typeof Promise.withResolvers<MailboxSyncResult>>;
};

export function createMailboxSyncScheduler({
  maxConcurrent,
  sync,
}: {
  maxConcurrent: number;
  sync: (emailAccountId: string) => Promise<MailboxSyncResult>;
}) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error("maxConcurrent must be a positive integer");
  }

  const requests = new Map<string, ScheduledSync>();
  const queue: ScheduledSync[] = [];
  let activeCount = 0;

  const enqueue = (request: ScheduledSync) => {
    if (!request.priority) {
      queue.push(request);
      return;
    }

    const firstStandardRequest = queue.findIndex((queued) => !queued.priority);
    if (firstStandardRequest === -1) queue.push(request);
    else queue.splice(firstStandardRequest, 0, request);
  };

  const drain = () => {
    while (activeCount < maxConcurrent) {
      const request = queue.shift();
      if (!request) return;
      request.queued = false;
      activeCount += 1;

      let syncResult: Promise<MailboxSyncResult>;
      try {
        syncResult = sync(request.emailAccountId);
      } catch (error) {
        syncResult = Promise.reject(error);
      }

      syncResult
        .then(request.result.resolve, request.result.reject)
        .then(() => {
          activeCount -= 1;
          if (requests.get(request.emailAccountId) === request) {
            requests.delete(request.emailAccountId);
          }
          drain();
        });
    }
  };

  return {
    run({
      emailAccountId,
      priority = false,
    }: {
      emailAccountId: string;
      priority?: boolean;
    }) {
      const existing = requests.get(emailAccountId);
      if (existing) {
        if (priority && !existing.priority && existing.queued) {
          existing.priority = true;
          const queueIndex = queue.indexOf(existing);
          if (queueIndex >= 0) queue.splice(queueIndex, 1);
          enqueue(existing);
        }
        return existing.result.promise;
      }

      const request: ScheduledSync = {
        emailAccountId,
        priority,
        queued: true,
        result: Promise.withResolvers<MailboxSyncResult>(),
      };
      requests.set(emailAccountId, request);
      enqueue(request);
      drain();
      return request.result.promise;
    },
  };
}
