const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;
const ACCOUNT_RESCAN_MS = 5000;

export function consumeMailboxSignalBuffer(buffer: string) {
  const events = buffer.split("\n\n");
  const rest = events.pop() ?? "";
  const changed = events.some((event) =>
    event.split("\n").some((line) => line.trim() === "event: mailbox-change"),
  );
  return { rest, changed };
}

export async function followMailboxSignal(input: {
  origin: string;
  accountId: string;
  cookieHeader: (url: string) => Promise<string> | string;
  signal: AbortSignal;
  onChange: () => void;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  let retryMs = INITIAL_RETRY_MS;
  while (!input.signal.aborted) {
    try {
      await readMailboxSignal(input, fetchImpl);
      retryMs = INITIAL_RETRY_MS;
      if (input.signal.aborted) return;
      await abortableDelay(INITIAL_RETRY_MS, input.signal);
    } catch (error) {
      if (input.signal.aborted || isAbortError(error)) return;
      await abortableDelay(retryMs, input.signal);
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
    }
  }
}

export async function watchMailboxSignals(input: {
  readAccountIds: () => Promise<string[]>;
  follow: (
    accountId: string,
    signal: AbortSignal,
    onChange: () => void,
  ) => Promise<void>;
  onChange: (accountId: string) => Promise<void> | void;
  signal: AbortSignal;
  rescanMs?: number;
}) {
  const active = new Map<string, AbortController>();
  try {
    while (!input.signal.aborted) {
      let accountIds: string[];
      try {
        accountIds = await input.readAccountIds();
      } catch {
        await abortableDelay(input.rescanMs ?? ACCOUNT_RESCAN_MS, input.signal);
        continue;
      }
      const wanted = new Set(accountIds);
      for (const [accountId, controller] of active) {
        if (wanted.has(accountId)) continue;
        controller.abort();
        active.delete(accountId);
      }
      for (const accountId of wanted) {
        if (active.has(accountId)) continue;
        const controller = new AbortController();
        const abortChild = () => controller.abort();
        input.signal.addEventListener("abort", abortChild, { once: true });
        active.set(accountId, controller);
        startAccountFollow({
          input,
          accountId,
          controller,
          active,
          abortChild,
        });
      }
      await abortableDelay(input.rescanMs ?? ACCOUNT_RESCAN_MS, input.signal);
    }
  } finally {
    for (const controller of active.values()) controller.abort();
    active.clear();
  }
}

function startAccountFollow({
  input,
  accountId,
  controller,
  active,
  abortChild,
}: {
  input: Parameters<typeof watchMailboxSignals>[0];
  accountId: string;
  controller: AbortController;
  active: Map<string, AbortController>;
  abortChild: () => void;
}) {
  input
    .follow(accountId, controller.signal, () => {
      const pending = input.onChange(accountId);
      if (pending instanceof Promise) pending.catch(() => undefined);
    })
    .finally(() => {
      input.signal.removeEventListener("abort", abortChild);
      if (active.get(accountId) === controller) active.delete(accountId);
    })
    .catch(() => undefined);
}

async function readMailboxSignal(
  input: {
    origin: string;
    accountId: string;
    cookieHeader: (url: string) => Promise<string> | string;
    signal: AbortSignal;
    onChange: () => void;
  },
  fetchImpl: typeof fetch,
) {
  const url = new URL("/api/mail-stream", input.origin);
  url.searchParams.set("emailAccountId", input.accountId);
  const cookieHeader = await cookieFor(
    input.cookieHeader,
    url.toString(),
    input.signal,
  );
  const response = await fetchImpl(url, {
    headers: {
      accept: "text/event-stream",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    signal: input.signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`mailbox signal failed (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!input.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const consumed = consumeMailboxSignalBuffer(buffer);
      buffer = consumed.rest;
      if (consumed.changed) input.onChange();
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function cookieFor(
  cookieHeader: (url: string) => Promise<string> | string,
  url: string,
  signal: AbortSignal,
) {
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(cookieHeader(url)).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function abortError() {
  return new DOMException("The operation was aborted", "AbortError");
}
