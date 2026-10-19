import { MAIL_ENGINE_OWNER_LOCK } from "./tab-channel";

export async function holdMailEngineOwner(input: {
  signal: AbortSignal;
  start: () => Promise<void>;
  close: () => Promise<void>;
}) {
  async function hold() {
    if (input.signal.aborted) return;
    try {
      await input.start();
      await new Promise<void>((resolve) => {
        if (input.signal.aborted) {
          resolve();
          return;
        }
        input.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    } finally {
      // SQLite's OPFS handles must be gone before the next tab starts.
      await input.close();
    }
  }
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    await navigator.locks.request(
      MAIL_ENGINE_OWNER_LOCK,
      { signal: input.signal },
      hold,
    );
    return;
  }
  await hold();
}
