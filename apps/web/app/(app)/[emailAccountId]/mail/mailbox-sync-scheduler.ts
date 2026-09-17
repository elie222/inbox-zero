import {
  captureEmailCacheEpoch,
  isEmailCacheEpochCurrent,
} from "@/utils/email-cache/database";

type MailboxSyncResult = { hasMore: boolean; pagesSynced: number };

type ScheduledSync = {
  emailAccountId: string;
  priority: boolean;
  queued: boolean;
  callers: { isCurrent: () => boolean; force: boolean }[];
  result: ReturnType<typeof Promise.withResolvers<MailboxSyncResult>>;
};

export function createMailboxSyncScheduler({
  maxConcurrent,
  sync,
}: {
  maxConcurrent: number;
  sync: (emailAccountId: string, force: boolean) => Promise<MailboxSyncResult>;
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

  const setQueuedPriority = (request: ScheduledSync, priority: boolean) => {
    if (!request.queued || request.priority === priority) return;

    request.priority = priority;
    const queueIndex = queue.indexOf(request);
    if (queueIndex < 0) return;
    queue.splice(queueIndex, 1);
    enqueue(request);
  };

  const drain = () => {
    while (activeCount < maxConcurrent) {
      const request = queue.shift();
      if (!request) return;
      request.queued = false;
      const callers = request.callers.filter((caller) => caller.isCurrent());
      if (!callers.length) {
        requests.delete(request.emailAccountId);
        request.result.resolve({ hasMore: false, pagesSynced: 0 });
        continue;
      }
      activeCount += 1;

      let syncResult: Promise<MailboxSyncResult>;
      try {
        syncResult = sync(
          request.emailAccountId,
          callers.some((caller) => caller.force),
        );
      } catch (error) {
        syncResult = Promise.reject(error);
      }

      syncResult.then(
        (value) => finishRequest(request, () => request.result.resolve(value)),
        (error) => finishRequest(request, () => request.result.reject(error)),
      );
    }
  };

  const finishRequest = (request: ScheduledSync, settle: () => void) => {
    activeCount -= 1;
    if (requests.get(request.emailAccountId) === request) {
      requests.delete(request.emailAccountId);
    }
    settle();
    drain();
  };

  const run = ({
    emailAccountId,
    priority = false,
    force = false,
    isCurrent,
  }: {
    emailAccountId: string;
    priority?: boolean;
    force?: boolean;
    isCurrent?: () => boolean;
  }) => {
    const epoch = captureEmailCacheEpoch(emailAccountId);
    const caller = {
      force,
      isCurrent: () =>
        isEmailCacheEpochCurrent(emailAccountId, epoch) &&
        (isCurrent?.() ?? true),
    };
    const existing = requests.get(emailAccountId);
    if (existing) {
      if (existing.queued) existing.callers.push(caller);
      if (priority) setQueuedPriority(existing, true);
      return existing.result.promise;
    }

    const request: ScheduledSync = {
      emailAccountId,
      priority,
      queued: true,
      callers: [caller],
      result: Promise.withResolvers<MailboxSyncResult>(),
    };
    requests.set(emailAccountId, request);
    enqueue(request);
    drain();
    return request.result.promise;
  };

  return {
    run,
    async runAfterCurrent({
      emailAccountId,
      priority = false,
    }: {
      emailAccountId: string;
      priority?: boolean;
    }) {
      const epoch = captureEmailCacheEpoch(emailAccountId);
      const existing = requests.get(emailAccountId);
      if (existing) {
        try {
          await existing.result.promise;
        } catch {
          // A fresh sync still needs to run after an older request fails.
        }
      }
      return run({
        emailAccountId,
        priority,
        force: true,
        isCurrent: () => isEmailCacheEpochCurrent(emailAccountId, epoch),
      });
    },
    setPriority({
      emailAccountId,
      priority,
    }: {
      emailAccountId: string;
      priority: boolean;
    }) {
      const request = requests.get(emailAccountId);
      if (request) setQueuedPriority(request, priority);
    },
  };
}
