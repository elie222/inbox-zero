type Transfer = {
  priority: "requested" | "speculative";
  run: () => Promise<void>;
};

const pending: Transfer[] = [];
let active = false;

export async function queueAttachmentDownload<T>({
  priority,
  signal,
  download,
}: {
  priority: Transfer["priority"];
  signal?: AbortSignal;
  download: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  signal?.throwIfAborted();
  if (!navigator.locks?.request)
    return Promise.reject(new Error("Attachment coordination unavailable"));

  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      controller.abort(signal?.reason);
      const index = pending.indexOf(transfer);
      if (index !== -1) {
        pending.splice(index, 1);
        signal?.removeEventListener("abort", abort);
        reject(controller.signal.reason);
      }
    };
    const transfer: Transfer = {
      priority,
      run: async () => {
        try {
          const result = await navigator.locks.request(
            "inbox-zero:attachment-transfer",
            { mode: "exclusive", signal: controller.signal },
            async () => {
              controller.signal.throwIfAborted();
              const value = await download(controller.signal);
              controller.signal.throwIfAborted();
              return value;
            },
          );
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          signal?.removeEventListener("abort", abort);
        }
      },
    };
    signal?.addEventListener("abort", abort, { once: true });
    pending.push(transfer);
    queueMicrotask(pump);
  });
}

async function pump() {
  if (active || !pending.length) return;
  const requested = pending.findIndex((item) => item.priority === "requested");
  const [transfer] = pending.splice(requested === -1 ? 0 : requested, 1);
  active = true;
  try {
    await transfer.run();
  } finally {
    active = false;
    queueMicrotask(pump);
  }
}
