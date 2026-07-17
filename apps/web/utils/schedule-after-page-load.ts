interface ScheduleAfterPageLoadOptions {
  fallbackDelay: number;
  idleTimeout: number;
}

export function scheduleAfterPageLoad(
  callback: () => void,
  { fallbackDelay, idleTimeout }: ScheduleAfterPageLoadOptions,
) {
  let idleCallbackId: number | undefined;
  let timeoutId: number | undefined;

  const schedule = () => {
    if ("requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(callback, {
        timeout: idleTimeout,
      });
    } else {
      timeoutId = globalThis.setTimeout(callback, fallbackDelay);
    }
  };

  if (document.readyState === "complete") {
    schedule();
  } else {
    window.addEventListener("load", schedule, { once: true });
  }

  return () => {
    window.removeEventListener("load", schedule);
    if (idleCallbackId !== undefined) {
      window.cancelIdleCallback(idleCallbackId);
    }
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  };
}
