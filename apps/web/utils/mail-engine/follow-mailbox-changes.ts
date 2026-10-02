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

  const open = () => {
    if (source || document.visibilityState === "hidden") return;
    source = createEventSource(url);
    source.addEventListener("mailbox-change", onChange);
  };
  const close = () => {
    source?.close();
    source = null;
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      close();
      return;
    }
    if (source) return;
    open();
    onChange();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  open();
  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    close();
  };
}
