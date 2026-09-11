import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOfflineMailCache,
  matchesOfflineMailRequest,
  clearsOfflineMailOnGet,
} from "./mail-cache";

const origin = "https://app.example.com";
const mailUrl = `${origin}/account-1/mail`;

// Cache Storage is the browser boundary; requests and responses remain real.
function createStorage() {
  const entries = new Map<string, Response>();
  return {
    match: async (key: string) => entries.get(key)?.clone(),
    put: async (key: string, response: Response) => {
      entries.set(key, response.clone());
    },
    delete: async (key: string | Request) =>
      entries.delete(typeof key === "string" ? key : key.url),
    keys: async () => [...entries.keys()].map((key) => new Request(key)),
  };
}

function html(body = "Saved mailbox") {
  return new Response(body, { headers: { "content-type": "text/html" } });
}

function documentRequest(url = mailUrl) {
  const request = new Request(url);
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
}

describe("offline mail cache", () => {
  let storage: ReturnType<typeof createStorage>;
  let pending: Promise<unknown>[];
  const network = vi.fn<typeof fetch>();
  const waitUntil = (promise: Promise<unknown>) => pending.push(promise);
  const makeCache = () => createOfflineMailCache({ origin, cacheName: "test" });

  beforeEach(() => {
    storage = createStorage();
    pending = [];
    network.mockReset();
    vi.stubGlobal("fetch", network);
    vi.stubGlobal("caches", { open: async () => storage });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens a previously visited mailbox when the actual network fails", async () => {
    const cache = makeCache();
    network.mockResolvedValueOnce(html());
    await cache.handle(documentRequest(), waitUntil);
    await Promise.all(pending);
    network.mockRejectedValue(new TypeError("Network unavailable"));
    // A new worker instance must restore the disk cache too.
    const response = await makeCache().handle(documentRequest(), waitUntil);
    expect(await response.text()).toBe("Saved mailbox");
  });

  it("uses saved mail within three seconds when the network hangs", async () => {
    const cache = makeCache();
    network.mockResolvedValueOnce(html());
    await cache.handle(documentRequest(), waitUntil);
    await Promise.all(pending);
    vi.useFakeTimers();
    network.mockImplementation(() => new Promise(() => {}));
    const response = cache.handle(documentRequest(), waitUntil);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await (await response).text()).toBe("Saved mailbox");
  });

  it("serves the saved mailbox while a background cache write is stalled", async () => {
    const cache = makeCache();
    network.mockResolvedValueOnce(html());
    await cache.handle(documentRequest(), waitUntil);
    await Promise.all(pending);

    let finishWrite!: () => void;
    const writing = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    vi.spyOn(storage, "put").mockReturnValueOnce(writing);
    network.mockResolvedValueOnce(html("Refreshed mailbox"));
    await cache.handle(documentRequest(), waitUntil);

    vi.useFakeTimers();
    network.mockImplementation(() => new Promise(() => {}));
    let body: string | undefined;
    const response = cache
      .handle(documentRequest(), waitUntil)
      .then(async (result) => {
        body = await result.text();
      });
    await vi.advanceTimersByTimeAsync(3000);
    try {
      expect(body).toBe("Saved mailbox");
    } finally {
      finishWrite();
      await response;
    }
  });

  it("uses saved mail when response headers arrive but the page body stalls", async () => {
    const cache = makeCache();
    network.mockResolvedValueOnce(html());
    await cache.handle(documentRequest(), waitUntil);
    await Promise.all(pending);
    vi.useFakeTimers();
    network.mockResolvedValueOnce(
      new Response(new ReadableStream(), {
        headers: { "content-type": "text/html" },
      }),
    );
    const response = cache.handle(documentRequest(), waitUntil);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await (await response).text()).toBe("Saved mailbox");
  });

  it("returns saved mail while a background cache write is stalled", async () => {
    vi.useFakeTimers();
    const cache = makeCache();
    await storage.put(mailUrl, html("Saved mailbox"));
    const pendingWrite = Promise.withResolvers<void>();
    vi.spyOn(storage, "put").mockReturnValueOnce(pendingWrite.promise);
    network.mockResolvedValueOnce(html("Refreshed mailbox"));
    await cache.handle(documentRequest(), waitUntil);
    network.mockImplementation(() => new Promise(() => {}));
    let fallback: Response | undefined;
    const loading = cache
      .handle(documentRequest(), waitUntil)
      .then((response) => {
        fallback = response;
      });
    try {
      await vi.advanceTimersByTimeAsync(3000);
      expect(fallback).toBeDefined();
      expect(await fallback?.text()).toBe("Saved mailbox");
    } finally {
      pendingWrite.resolve();
      await loading;
    }
  });

  it("does not return saved mail if logout starts during the cache lookup", async () => {
    const cache = makeCache();
    const lookupStarted = Promise.withResolvers<void>();
    const lookup = Promise.withResolvers<Response | undefined>();
    vi.spyOn(storage, "match").mockImplementationOnce(() => {
      lookupStarted.resolve();
      return lookup.promise;
    });
    network.mockRejectedValue(new TypeError("Network unavailable"));
    const loading = cache.handle(documentRequest(), waitUntil);
    await lookupStarted.promise;
    await cache.clear();
    lookup.resolve(html("Previous session mailbox"));
    await expect(loading).rejects.toThrow("Network unavailable");
    await Promise.all(pending);
  });

  it("bounds a stalled request even when there is no saved mailbox", async () => {
    vi.useFakeTimers();
    network.mockImplementation(
      (_request, options) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal;
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const result = expect(
      makeCache().handle(documentRequest(), waitUntil),
    ).rejects.toThrow("Mailbox request timed out");
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    await Promise.all(pending);
  });

  it("coalesces simultaneous saves and permits refreshing again later", async () => {
    const cache = makeCache();
    network.mockImplementation(async (request) =>
      new URL((request as Request).url).pathname.includes("/api/")
        ? Response.json({ emailAccounts: [] })
        : html(),
    );
    await Promise.all([
      cache.save(mailUrl, waitUntil),
      cache.save(`${mailUrl}?type=archive`, waitUntil),
    ]);
    await Promise.all(pending);
    expect(network).toHaveBeenCalledTimes(2);
    await cache.save(mailUrl, waitUntil);
    await Promise.all(pending);
    expect(network).toHaveBeenCalledTimes(4);
  });

  it("does not fetch account metadata if logout interrupts saving the document", async () => {
    const cache = makeCache();
    let complete!: (response: Response) => void;
    network.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const saving = cache.save(mailUrl, waitUntil);
    await cache.clear();
    complete(html());
    await saving;
    await Promise.all(pending);
    expect(network).toHaveBeenCalledOnce();
  });

  it("preserves mailbox views without mixing accounts or caching RSC payloads", () => {
    expect(
      matchesOfflineMailRequest(
        documentRequest(`${mailUrl}?type=archive`),
        origin,
      ),
    ).toBe(true);
    expect(
      matchesOfflineMailRequest(
        new Request(mailUrl, { headers: { RSC: "1" } }),
        origin,
      ),
    ).toBe(false);
    expect(
      matchesOfflineMailRequest(documentRequest(`${origin}/login`), origin),
    ).toBe(false);
    expect(
      matchesOfflineMailRequest(
        documentRequest("https://other.example.com/account-1/mail"),
        origin,
      ),
    ).toBe(false);
  });

  it("clears offline mail on SSO entry and callbacks without clearing it for session reads", () => {
    for (const path of [
      "/api/sso/signin",
      "/api/auth/sso/callback/provider",
      "/api/auth/sso/saml2/callback/provider",
    ]) {
      expect(
        clearsOfflineMailOnGet(new Request(`${origin}${path}`), origin),
      ).toBe(true);
    }
    expect(
      clearsOfflineMailOnGet(
        new Request(`${origin}/api/auth/get-session`),
        origin,
      ),
    ).toBe(false);
    expect(
      clearsOfflineMailOnGet(
        new Request("https://other.example.com/api/sso/signin"),
        origin,
      ),
    ).toBe(false);
    expect(
      clearsOfflineMailOnGet(documentRequest(`${origin}/login`), origin),
    ).toBe(true);
  });

  it("restores account metadata but never caches arbitrary API responses", async () => {
    const cache = makeCache();
    const request = new Request(`${origin}/api/user/email-accounts`);
    network.mockResolvedValueOnce(
      Response.json({ emailAccounts: [{ id: "account-1" }] }),
    );
    await cache.handle(request, waitUntil);
    await Promise.all(pending);
    network.mockRejectedValue(new TypeError("Network unavailable"));
    expect(await (await cache.handle(request, waitUntil)).json()).toEqual({
      emailAccounts: [{ id: "account-1" }],
    });
    expect(
      matchesOfflineMailRequest(new Request(`${origin}/api/threads`), origin),
    ).toBe(false);
    expect(
      matchesOfflineMailRequest(
        new Request(`${origin}/api/auth/get-session`),
        origin,
      ),
    ).toBe(false);
  });

  it("never substitutes cached content for an authentication failure", async () => {
    const cache = makeCache();
    network.mockResolvedValueOnce(html());
    await cache.handle(documentRequest(), waitUntil);
    await Promise.all(pending);
    network.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await cache.handle(documentRequest(), waitUntil)).status).toBe(401);
    network.mockRejectedValue(new TypeError("Network unavailable"));
    await expect(cache.handle(documentRequest(), waitUntil)).rejects.toThrow();
  });

  it("does not let a stale authentication failure erase a newer mailbox", async () => {
    const cache = makeCache();
    let complete!: (response: Response) => void;
    network.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const oldRequest = cache.handle(documentRequest(), waitUntil);
    await cache.clear();
    network.mockResolvedValueOnce(html("New session mailbox"));
    await cache.handle(documentRequest(), waitUntil);
    complete(new Response(null, { status: 401 }));
    await oldRequest;
    await Promise.all(pending);
    network.mockRejectedValue(new TypeError("Network unavailable"));
    expect(
      await (await cache.handle(documentRequest(), waitUntil)).text(),
    ).toBe("New session mailbox");
  });

  it("does not keep login redirects as a saved mailbox", async () => {
    const cache = makeCache();
    network.mockResolvedValueOnce(html());
    await cache.handle(documentRequest(), waitUntil);
    await Promise.all(pending);
    const login = html("Sign in");
    Object.defineProperties(login, {
      redirected: { value: true },
      url: { value: `${origin}/login` },
    });
    network.mockResolvedValueOnce(login);
    await cache.handle(documentRequest(), waitUntil);
    network.mockRejectedValue(new TypeError("Network unavailable"));
    await expect(cache.handle(documentRequest(), waitUntil)).rejects.toThrow();
  });

  it("clears saved pages and prevents an in-flight response restoring them after logout", async () => {
    const cache = makeCache();
    let complete!: (response: Response) => void;
    network.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const loading = cache.handle(documentRequest(), waitUntil);
    await cache.clear();
    complete(html());
    await loading;
    await Promise.all(pending);
    network.mockRejectedValue(new TypeError("Network unavailable"));
    await expect(
      makeCache().handle(documentRequest(), waitUntil),
    ).rejects.toThrow();
  });

  it("never serves another account's document", async () => {
    const cache = makeCache();
    network.mockResolvedValueOnce(html());
    await cache.handle(documentRequest(), waitUntil);
    await Promise.all(pending);
    network.mockRejectedValue(new TypeError("Network unavailable"));
    await expect(
      cache.handle(documentRequest(`${origin}/account-2/mail`), waitUntil),
    ).rejects.toThrow();
  });

  it("does not cache requests that begin while logout is deleting pages", async () => {
    const cache = makeCache();
    const deletion = Promise.withResolvers<Request[]>();
    vi.spyOn(storage, "keys").mockReturnValueOnce(deletion.promise);
    const clearing = cache.clear();
    network.mockResolvedValueOnce(html());
    await cache.handle(documentRequest(), waitUntil);
    deletion.resolve([]);
    await clearing;
    await Promise.all(pending);
    expect(await storage.match(mailUrl)).toBeUndefined();
  });

  it("allows a fresh save after clearing an unfinished save", async () => {
    const cache = makeCache();
    const oldResponse = Promise.withResolvers<Response>();
    const newResponse = Promise.withResolvers<Response>();
    network.mockReturnValueOnce(oldResponse.promise);
    const oldSave = cache.save(mailUrl, waitUntil);
    await cache.clear();
    network.mockReturnValueOnce(newResponse.promise);
    const newSave = cache.save(mailUrl, waitUntil);
    expect(network).toHaveBeenCalledTimes(2);
    oldResponse.resolve(html("Old mailbox"));
    await oldSave;
    const sameSave = cache.save(mailUrl, waitUntil);
    expect(sameSave).toBe(newSave);
    network.mockResolvedValueOnce(Response.json({ emailAccounts: [] }));
    newResponse.resolve(html("New mailbox"));
    await newSave;
    await Promise.all(pending);
    expect(await (await storage.match(mailUrl))?.text()).toBe("New mailbox");
  });

  it("keeps slow saves coalesced after returning a cached fallback", async () => {
    vi.useFakeTimers();
    const cache = makeCache();
    await storage.put(mailUrl, html("Saved mailbox"));
    const liveResponse = Promise.withResolvers<Response>();
    network.mockReturnValueOnce(liveResponse.promise);
    network.mockResolvedValue(Response.json({ emailAccounts: [] }));
    const firstSave = cache.save(mailUrl, waitUntil);
    await vi.advanceTimersByTimeAsync(6000);
    const secondSave = cache.save(mailUrl, waitUntil);
    expect(secondSave).toBe(firstSave);
    liveResponse.resolve(html("Refreshed mailbox"));
    await Promise.all([firstSave, secondSave]);
    expect(await (await storage.match(mailUrl))?.text()).toBe(
      "Refreshed mailbox",
    );
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("still returns live mail when local storage fails", async () => {
    vi.stubGlobal("caches", {
      open: async () => {
        throw new Error("Storage unavailable");
      },
    });
    network.mockResolvedValue(html("Live mailbox"));
    expect(
      await (await makeCache().handle(documentRequest(), waitUntil)).text(),
    ).toBe("Live mailbox");
    await Promise.all(pending);
  });
});
