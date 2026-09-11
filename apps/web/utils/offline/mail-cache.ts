const MAIL_PATH = /^\/[^/]+\/mail\/?$/u;
const ACCOUNT_PATH = "/api/user/email-accounts";
export const OFFLINE_MAIL_CACHE_PREFIX = "inbox-zero:offline-mail:";
export const CLEAR_OFFLINE_MAIL = "inbox-zero:clear-offline-mail";
export const SAVE_OFFLINE_MAIL = "inbox-zero:save-offline-mail";

type WaitUntil = (promise: Promise<unknown>) => void;

// Documents and account metadata let the existing IndexedDB mailbox open
// without a server. API mutations and authentication always use the network.
export function createOfflineMailCache({
  origin,
  cacheName,
}: {
  origin: string;
  cacheName: string;
}) {
  let generation = 0;
  let activeClears = 0;
  let writes: Promise<unknown> = Promise.resolve();
  const saves = new Map<string, Promise<void>>();

  function queueWrite(operation: (cache: Cache) => Promise<unknown>) {
    writes = writes
      .then(async () => operation(await caches.open(cacheName)))
      .catch(() => {});
    return writes;
  }

  async function clear() {
    generation++;
    activeClears++;
    saves.clear();
    try {
      await queueWrite(async (cache) => {
        await Promise.all((await cache.keys()).map((key) => cache.delete(key)));
      });
    } finally {
      activeClears--;
    }
  }

  async function handle(request: Request, waitUntil: WaitUntil) {
    const startedAtGeneration = activeClears ? undefined : generation;
    const url = new URL(request.url);
    // Mail's query parameters select client-side views of the same account.
    const key = `${origin}${url.pathname}`;
    const isDocument = isOfflineMailPath(url.pathname);
    const controller = new AbortController();
    const abortRequest = () => controller.abort(request.signal.reason);
    request.signal.addEventListener("abort", abortRequest, { once: true });
    if (request.signal.aborted) abortRequest();
    const networkTimeout = setTimeout(() => {
      controller.abort(new Error("Mailbox request timed out"));
    }, 15_000);
    const cached = async () => {
      if (startedAtGeneration !== generation) return;
      try {
        // A stalled refresh must not block reading the previously saved page.
        const response = await (await caches.open(cacheName)).match(key);
        return startedAtGeneration === generation ? response : undefined;
      } catch {
        return;
      }
    };
    const network = (async () => {
      const response = await fetch(request, { signal: controller.signal });
      const responsePath = response.url
        ? new URL(response.url).pathname
        : url.pathname;
      if (
        response.status === 401 ||
        response.status === 403 ||
        (isDocument && response.redirected && responsePath !== url.pathname)
      ) {
        if (startedAtGeneration === generation) await clear();
        return response;
      }
      if (response.status >= 500) {
        return (await cached()) ?? response;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (
        response.status === 200 &&
        contentType.includes(isDocument ? "text/html" : "application/json") &&
        startedAtGeneration === generation
      ) {
        // Headers can arrive while the streamed HTML stalls indefinitely.
        // Keep the timeout active until the document is actually readable.
        await response.clone().arrayBuffer();
        const copy = response.clone();
        waitUntil(
          queueWrite(async (cache) => {
            // Logout can happen while opening Cache Storage or writing another entry.
            if (startedAtGeneration === generation) await cache.put(key, copy);
          }),
        );
      }
      return response;
    })().finally(() => {
      clearTimeout(networkTimeout);
      request.signal.removeEventListener("abort", abortRequest);
    });
    // Keep a late successful response alive to refresh the offline copy, even
    // after the timeout has already returned the saved document.
    waitUntil(network.catch(() => {}));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fallback = new Promise<Response>((resolve) => {
      timeout = setTimeout(async () => {
        const response = await cached();
        if (response) resolve(response);
      }, 3000);
    });
    try {
      return await Promise.race([
        network.catch(async (error: unknown) => {
          const response = await cached();
          if (response) return response;
          throw error;
        }),
        fallback,
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  function save(url: string, waitUntil: WaitUntil): Promise<void> {
    const parsed = new URL(url);
    if (
      activeClears ||
      parsed.origin !== origin ||
      !isOfflineMailPath(parsed.pathname)
    )
      return Promise.resolve();
    const key = parsed.pathname;
    const existing = saves.get(key);
    if (existing) return existing;
    const startedAtGeneration = generation;
    const backgroundWork: Promise<unknown>[] = [];
    const trackWork: WaitUntil = (promise) => {
      backgroundWork.push(promise);
      waitUntil(promise);
    };
    const saving = (async () => {
      const response = await handle(
        new Request(url, {
          credentials: "include",
          headers: { Accept: "text/html" },
        }),
        trackWork,
      );
      if (
        response.status !== 200 ||
        response.redirected ||
        startedAtGeneration !== generation
      )
        return;
      await handle(
        new Request(`${origin}${ACCOUNT_PATH}`, {
          credentials: "include",
        }),
        trackWork,
      );
    })().finally(async () => {
      // A cached fallback can return while the live refresh is still running.
      await Promise.all(backgroundWork);
      await writes;
      if (saves.get(key) === saving) saves.delete(key);
    });
    saves.set(key, saving);
    return saving;
  }

  return { handle, clear, save };
}

export function matchesOfflineMailRequest(request: Request, origin: string) {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== origin) return false;
  if (request.headers.has("RSC")) return false;
  return (
    (request.mode === "navigate" && isOfflineMailPath(url.pathname)) ||
    (url.pathname === ACCOUNT_PATH && !url.search)
  );
}

export function isOfflineMailPath(pathname: string) {
  return MAIL_PATH.test(pathname);
}

export function clearsOfflineMailOnGet(request: Request, origin: string) {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== origin) return false;
  return (
    url.pathname === "/api/sso/signin" ||
    url.pathname.startsWith("/api/auth/sso/") ||
    (request.mode === "navigate" &&
      ["/login", "/welcome-redirect", "/connect-mailbox"].includes(
        url.pathname,
      ))
  );
}
