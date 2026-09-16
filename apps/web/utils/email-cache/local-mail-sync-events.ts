const listeners = new Set<(emailAccountId: string) => void>();

export function requestLocalMailSync(emailAccountId: string) {
  for (const listener of listeners) listener(emailAccountId);
}

export function subscribeToLocalMailSyncRequests(
  listener: (emailAccountId: string) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
