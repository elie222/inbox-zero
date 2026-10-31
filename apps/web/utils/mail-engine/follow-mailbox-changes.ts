const CLOSED_STREAM_RETRY_MS = 30_000;
// EventSource.CLOSED, without depending on the global in non-browser runtimes.
const EVENT_SOURCE_CLOSED = 2;

/**
 * Requests a sync when the server reports a provider change, so new mail
 * shows up without waiting for the engine's idle catch-up. Hidden tabs drop
 * the connection and catch up once they are visible again.
 */
export function followMailboxChanges({
  accountId,
  onChange,
  createEventSource = (url) => new EventSource(url),
}: {
  accountId: string;
  onChange: () => void;
  createEventSource?: (url: string) => EventSource;
}) {
  const url = `/api/mail-stream?emailAccountId=${encodeURIComponent(accountId)}`;
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    if (source || document.visibilityState === "hidden") return;
    const opened = createEventSource(url);
    source = opened;
    opened.addEventListener("mailbox-change", onChange);
    // Every (re)connect sends `ready`; changes while disconnected are not
    // replayed, so catch up then.
    opened.addEventListener("ready", onChange);
    opened.addEventListener("error", () => {
      // EventSource retries dropped connections itself but gives up on an
      // error response, which would otherwise leave this tab without updates.
      if (opened.readyState !== EVENT_SOURCE_CLOSED || source !== opened)
        return;
      source = null;
      clearTimeout(retry);
      retry = setTimeout(open, CLOSED_STREAM_RETRY_MS);
    });
  };
  const close = () => {
    clearTimeout(retry);
    source?.close();
    source = null;
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") close();
    else open();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  open();
  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    close();
  };
}
