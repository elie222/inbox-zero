type CacheChange = { emailAccountId?: string };
const listeners = new Set<(change: CacheChange) => void>();
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("inbox-zero-email-cache-changes")
    : undefined;
channel?.addEventListener("message", (event: MessageEvent<CacheChange>) => {
  if (
    event.data &&
    (event.data.emailAccountId === undefined ||
      typeof event.data.emailAccountId === "string")
  ) {
    for (const listener of listeners) listener(event.data);
  }
});

export function notifyEmailCacheChange(emailAccountId?: string) {
  const change = { emailAccountId };
  for (const listener of listeners) listener(change);
  channel?.postMessage(change);
}

export function subscribeToEmailCacheChanges(
  listener: (change: CacheChange) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
