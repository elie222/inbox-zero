const queues = new Map<string, Promise<unknown>>();

/**
 * Runs mailbox draft changes for one compose session one at a time. Gmail
 * replaces the whole message on every change, so a text save that overlapped
 * an attachment upload could write the draft back without the new file.
 * Keyed by session rather than component so a closed composer's uploads still
 * finish in order.
 */
export function enqueueDraftOperation<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  const tail = next.catch(() => undefined);
  queues.set(key, tail);
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return next;
}

export async function waitForDraftOperations(key: string) {
  await queues.get(key);
}
