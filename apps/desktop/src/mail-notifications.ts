const MAX_MESSAGE_AGE_MS = 5 * 60_000;

// Keep the baseline in the main process so renderer reloads do not replay mail.
export function createMailNotificationTracker(startedAt = Date.now()) {
  const seen = new Map<string, number>();

  return (payload: unknown, now = Date.now()) => {
    if (!payload || typeof payload !== "object") return null;
    if (!("emailAccountId" in payload) || !("messages" in payload)) return null;
    const { emailAccountId, messages } = payload;
    if (
      typeof emailAccountId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(emailAccountId) ||
      !Array.isArray(messages) ||
      messages.length > 100
    )
      return null;

    const cutoff = Math.max(startedAt, now - MAX_MESSAGE_AGE_MS);
    for (const [key, receivedAt] of seen) {
      if (receivedAt <= cutoff) seen.delete(key);
    }
    let count = 0;
    for (const message of messages) {
      if (
        !message ||
        typeof message.id !== "string" ||
        !message.id ||
        message.id.length > 1024 ||
        typeof message.receivedAt !== "number" ||
        !Number.isFinite(message.receivedAt) ||
        message.receivedAt <= cutoff ||
        message.receivedAt > now
      )
        continue;
      const key = JSON.stringify([emailAccountId, message.id]);
      if (seen.has(key)) continue;
      seen.set(key, message.receivedAt);
      count += 1;
    }
    return count ? { emailAccountId, count } : null;
  };
}
