import { build } from "esbuild";
import { localMailSyncBody } from "@/utils/actions/local-mail-sync.validation";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { ThreadListItem } from "@/utils/threads/load";
import { expect, type Page } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import {
  conversationWithSubject,
  openMail,
  openMailboxFromSidebar,
} from "./mail-test-helpers";

test("clears an uncommitted live search with the button and sidebar navigation", async ({
  page,
}) => {
  await openMail(page);
  const input = page.getByPlaceholder("Search mail");
  await input.fill("uncommitted search");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(input).toHaveValue("");
  await input.fill("uncommitted search");
  await openMailboxFromSidebar(page, "Sent");
  await expect(page).toHaveURL(/type=sent/);
  await expect(input).toHaveValue("");
  await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
  await expect(page).toHaveURL(/type=inbox/);
  await expect(input).toHaveValue("");
});

for (const scope of ["single", "all"] as const) {
  test(`${scope}: shows local matches while typing before provider completion`, async ({
    page,
    context,
  }, testInfo) => {
    // Every cache-seeding test here stubs sync before loading the page: an
    // account's first sync applies a reset that clears its cached mail, which
    // would delete the rows seeded below.
    await page.route("**/api/mobile/mailbox-sync", (route) => route.abort());
    const { emailAccountId, conversations } = await openMail(page);
    if (scope === "all")
      await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    await expect(conversations).toBeVisible();
    const cachedThread = await seedSearchCache(
      page,
      emailAccountId,
      scope === "single" ? 5001 : 0,
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/threads**", async (route) => {
      if (!new URL(route.request().url()).searchParams.get("q"))
        return route.continue();
      await gate;
      await route.fulfill({
        json: {
          threads: [
            {
              ...cachedThread,
              id: "provider-only-thread",
              messageIds: ["provider-only-message"],
              messages: [
                {
                  ...cachedThread.messages[0],
                  id: "provider-only-message",
                  threadId: "provider-only-thread",
                  subject: "Provider-only search result",
                  headers: {
                    ...cachedThread.messages[0].headers,
                    subject: "Provider-only search result",
                  },
                  internalDate: String(Date.now() + 1000),
                },
              ],
            },
            cachedThread,
          ].map((thread) =>
            scope === "all"
              ? {
                  ...thread,
                  account: {
                    id: emailAccountId,
                    email: "user@example.com",
                    name: null,
                    image: null,
                  },
                }
              : thread,
          ),
          nextPageToken: null,
          labelsByAccount: {},
          failedAccountIds: [],
        },
      });
    });
    const input = page.getByPlaceholder("Search mail");
    const startedAt = Date.now();
    await input.fill("needle");
    const match = conversationWithSubject(
      page,
      conversations,
      "Cached body search result",
    );
    await expect(match).toBeVisible();
    await expect(input).toBeFocused();
    await expect(
      page.getByRole("status").filter({ hasText: /searching|cached/i }),
    ).toHaveCount(0);
    await testInfo.attach("local-search-latency", {
      body: JSON.stringify({ firstResultMs: Date.now() - startedAt }),
      contentType: "application/json",
    });
    await capturePlaywrightCheckpoint(page, testInfo, `local-search-${scope}`);
    release();
    await expect(
      conversationWithSubject(
        page,
        conversations,
        "Provider-only search result",
      ),
    ).toBeVisible();
    await expect(match).toHaveCount(1);
    await expect(match).toHaveAttribute("tabindex", "0");
    await expect(
      page.getByRole("status").filter({ hasText: /searching|cached/i }),
    ).toHaveCount(0);
    await context.setOffline(true);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      `provider-results-offline-${scope}`,
    );
    await expect(
      page.getByText("Offline. Results may be incomplete.", { exact: true }),
    ).toHaveCount(0);
  });
}

test("searches cached bodies offline and distinguishes unsupported and empty searches", async ({
  page,
  context,
}, testInfo) => {
  await page.route("**/api/mobile/mailbox-sync", (route) => route.abort());
  const { emailAccountId, conversations } = await openMail(page);
  await seedSearchCache(page, emailAccountId);
  await page.route("**/api/threads?**", (route) =>
    new URL(route.request().url()).searchParams.get("q")
      ? route.abort()
      : route.continue(),
  );
  // Warm the worker before disconnecting; results must not require another script fetch.
  await page.getByPlaceholder("Search mail").fill("needle");
  await expect(
    conversationWithSubject(page, conversations, "Cached body search result"),
  ).toBeVisible();
  await context.setOffline(true);
  const input = page.getByPlaceholder("Search mail");
  await input.fill("subject:Cached");
  await expect(
    conversationWithSubject(page, conversations, "Cached body search result"),
  ).toBeVisible();
  await expect(
    page.getByText("Offline. Results may be incomplete.", { exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "local-search-offline");
  await input.fill("needle OR no-such-cached-message");
  await expect(
    conversationWithSubject(page, conversations, "Cached body search result"),
  ).toBeVisible();
  await input.fill("subject:Cached -needle");
  await expect(
    page.getByText("No matches yet.", { exact: true }),
  ).toBeVisible();
  await input.fill("no-such-cached-message");
  await expect(
    page.getByText("No matches yet.", { exact: true }),
  ).toBeVisible();
  await input.fill("has:attachment");
  await expect(
    page.getByText("Connect to search this query with your email provider.", {
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(false);
});

test("ignores delayed responses after the search changes", async ({ page }) => {
  await page.route("**/api/mobile/mailbox-sync", (route) => route.abort());
  const { emailAccountId, conversations } = await openMail(page);
  const cachedThread = await seedSearchCache(page, emailAccountId);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let releaseCurrent!: () => void;
  const currentGate = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  let firstRequested = false;
  let firstResponded = false;
  await page.route("**/api/threads?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (!query) return route.continue();
    if (query === "needle") {
      firstRequested = true;
      await gate;
      await route.fulfill({
        json: { threads: [cachedThread], nextPageToken: null },
      });
      firstResponded = true;
      return;
    }
    await currentGate;
    await route.fulfill({ json: { threads: [], nextPageToken: null } });
  });
  const input = page.getByPlaceholder("Search mail");
  await input.fill("needle");
  await expect(
    conversationWithSubject(page, conversations, "Cached body search result"),
  ).toBeVisible();
  await expect.poll(() => firstRequested).toBe(true);
  await input.fill("no-such-cached-message");
  const cachedEmpty = page.getByText("No matches yet.", { exact: true });
  await expect(cachedEmpty).toBeVisible();
  release();
  await expect.poll(() => firstResponded).toBe(true);
  await expect(cachedEmpty).toBeVisible();
  releaseCurrent();
  await expect(page.getByText("No emails in this view")).toBeVisible();
  await expect(conversations.getByRole("option")).toHaveCount(0);
  await expect(input).toHaveValue("no-such-cached-message");
});

async function seedSearchCache(
  page: Page,
  emailAccountId: string,
  messageCount = 0,
) {
  return page.evaluate(
    async ({ accountId, messageCount }) =>
      new Promise<ThreadListItem>((resolve, reject) => {
        const request = indexedDB.open("inbox-zero-email-cache");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction(
            [
              "threadDetails",
              "mailboxMessages",
              "searchIndexAccounts",
              "localMailMessages",
              "searchIndexWork",
            ],
            "readwrite",
          );
          const now = Date.now();
          const message = {
            id: "cached-search-message",
            threadId: "cached-search-thread",
            subject: "Cached body search result",
            snippet: "Preview without the search term",
            textPlain: "A needle in the full cached body",
            date: new Date(now).toISOString(),
            internalDate: String(now),
            headers: {
              from: "sender@example.com",
              to: "recipient@example.com",
              subject: "Cached body search result",
              date: "",
            },
            labelIds: ["INBOX"],
            historyId: "1",
            inline: [],
          };
          const account = tx.objectStore("searchIndexAccounts").get(accountId);
          account.onsuccess = () => {
            if (!account.result)
              // Seeding an older source version would make the runtime migrate
              // the account on its first tick, discarding the rows below.
              tx.objectStore("searchIndexAccounts").put({
                emailAccountId: accountId,
                generation: crypto.randomUUID(),
                sourceVersion: 2,
              });
            tx.objectStore("localMailMessages").put({
              emailAccountId: accountId,
              messageId: message.id,
              threadId: message.threadId,
              data: message,
              fetchedAt: now,
              bodyFetchedAt: now,
              lastAccessedAt: now,
              receivedAt: now,
              byteSize: new Blob([JSON.stringify(message)]).size,
            });
            tx.objectStore("searchIndexWork").put({
              emailAccountId: accountId,
              threadId: message.threadId,
              token: crypto.randomUUID(),
              status: "pending",
            });
          };
          tx.objectStore("threadDetails").put({
            emailAccountId: accountId,
            threadId: message.threadId,
            variant: "drafts:1|replies:0",
            data: { thread: { id: message.threadId, messages: [message] } },
            fetchedAt: now,
            lastAccessedAt: now,
            byteSize: 1000,
          });
          for (let index = 0; index < messageCount; index++) {
            const data = {
              ...message,
              id: `background-${index}`,
              threadId: `background-${index}`,
              subject: "Background cached mail",
              snippet: "Background preview",
              textPlain: undefined,
              internalDate: String(now - index),
            };
            tx.objectStore("mailboxMessages").put({
              emailAccountId: accountId,
              messageId: data.id,
              threadId: data.threadId,
              data,
              receivedAt: now - index,
              lastAccessedAt: now,
            });
          }
          tx.oncomplete = () => {
            database.close();
            const channel = new BroadcastChannel(
              "inbox-zero-email-cache-changes",
            );
            channel.postMessage({ emailAccountId: accountId });
            channel.close();
            resolve({
              id: message.threadId,
              messages: [message],
              messageIds: [message.id],
              snippet: message.snippet,
              participantMessages: undefined,
              plan: undefined,
              plans: [],
            });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { accountId: emailAccountId, messageCount },
  );
}

test("uses the persistent index offline after reopening and pages beyond the first disk result batch", async ({
  page,
  context,
}, testInfo) => {
  const assets = new Set<string>();
  const workerName = `sw-search-test-${process.pid}.js`;
  const workerFile = path.resolve("public", workerName);
  context.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/_next/static/"))
      assets.add(response.url());
  });
  try {
    await page.route("**/api/mobile/mailbox-sync", (route) => route.abort());
    await page.route("**/*/mail", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      try {
        const args = route.request().postDataJSON();
        if (Array.isArray(args) && localMailSyncBody.safeParse(args[1]).success)
          return route.abort();
      } catch {
        return route.continue();
      }
      return route.continue();
    });
    const { emailAccountId } = await openMail(page);
    await expect
      .poll(() =>
        page.evaluate(async (emailAccountId) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("inbox-zero-email-cache");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const account = await new Promise<
            { sourceVersion?: number; seed?: unknown } | undefined
          >((resolve, reject) => {
            const request = database
              .transaction("searchIndexAccounts")
              .objectStore("searchIndexAccounts")
              .get(emailAccountId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          database.close();
          return account?.sourceVersion === 2 && !account.seed;
        }, emailAccountId),
      )
      .toBe(true);

    await page.evaluate(async (emailAccountId) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("inbox-zero-email-cache");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(
        ["searchIndexAccounts", "localMailMessages", "searchIndexWork"],
        "readwrite",
      );
      const account = tx.objectStore("searchIndexAccounts").get(emailAccountId);
      account.onsuccess = () => {
        if (!account.result)
          tx.objectStore("searchIndexAccounts").put({
            emailAccountId,
            generation: crypto.randomUUID(),
            sourceVersion: 1,
          });
      };
      const now = Date.now();
      for (let index = 0; index < 105; index++) {
        const id = `persistent-${index}`;
        const data = {
          id,
          threadId: id,
          subject: `Indexed message ${index}`,
          snippet: index === 1 ? "archiveproof preview" : "Stored preview",
          textPlain: index === 1 ? undefined : `archiveproof body ${index}`,
          date: new Date(now - index).toISOString(),
          internalDate: String(now - index),
          headers: {
            from: "sender@example.com",
            to: "recipient@example.com",
            subject: `Indexed message ${index}`,
            date: new Date(now - index).toISOString(),
          },
          labelIds: ["INBOX"],
          historyId: "1",
          inline: [],
        };
        tx.objectStore("localMailMessages").put({
          emailAccountId,
          messageId: id,
          threadId: id,
          data,
          fetchedAt: now,
          bodyFetchedAt: index === 1 ? undefined : now,
          receivedAt: now - index,
          lastAccessedAt: now,
          byteSize: new Blob([JSON.stringify(data)]).size,
        });
        tx.objectStore("searchIndexWork").put({
          emailAccountId,
          threadId: id,
          token: crypto.randomUUID(),
          status: "pending",
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      const channel = new BroadcastChannel("inbox-zero-email-cache-changes");
      channel.postMessage({ emailAccountId });
      channel.close();
    }, emailAccountId);
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const db = await new Promise<IDBDatabase>((resolve) => {
              const request = indexedDB.open("inbox-zero-email-cache");
              request.onsuccess = () => resolve(request.result);
            });
            const request = db
              .transaction("searchIndexWork")
              .objectStore("searchIndexWork")
              .count();
            const count = await new Promise<number>((resolve) => {
              request.onsuccess = () => resolve(request.result);
            });
            db.close();
            return count;
          }),
        { timeout: 90_000 },
      )
      .toBe(0);
    expect([...assets].some((asset) => asset.includes(".wasm"))).toBe(true);
    const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
    if (!production) {
      await build({
        entryPoints: ["app/sw.ts"],
        bundle: true,
        define: {
          "process.env.NODE_ENV": JSON.stringify("production"),
          "self.__SW_MANIFEST": JSON.stringify(
            [...assets].map((url) => ({ url, revision: null })),
          ),
        },
        outfile: workerFile,
      });
    }
    await page.evaluate(
      async (name) => {
        await navigator.serviceWorker.register(`/${name}`, { scope: "/" });
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise<void>((resolve) =>
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => resolve(),
              { once: true },
            ),
          );
        navigator.serviceWorker.controller?.postMessage({
          type: "inbox-zero:save-offline-mail",
        });
      },
      production ? "sw.js" : workerName,
    );
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const name = (await caches.keys()).find((key) =>
            key.startsWith("inbox-zero:offline-mail:"),
          );
          if (!name) return false;
          const cache = await caches.open(name);
          return (
            !!(await cache.match(location.origin + location.pathname)) &&
            !!(await cache.match(`${location.origin}/api/user/email-accounts`))
          );
        }),
      )
      .toBe(true);
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("inbox-zero-email-cache");
        request.onsuccess = () => resolve(request.result);
      });
      const tx = db.transaction(
        ["threadRows", "threadDetails", "mailboxMessages"],
        "readwrite",
      );
      for (const name of ["threadRows", "threadDetails", "mailboxMessages"])
        tx.objectStore(name).clear();
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
      });
      db.close();
    });
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("Search mail")).toBeVisible();
    await page.getByPlaceholder("Search mail").fill("archiveproof");
    await expect(
      page.getByText("Indexed message 0", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Load more", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByText("Indexed message 104", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Load more", exact: true }),
    ).toHaveCount(0);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "persistent-search-offline",
    );
    await page
      .getByRole("option")
      .filter({ has: page.getByText("Indexed message 0", { exact: true }) })
      .click();
    const reader = page.getByTestId("thread-reader").filter({ visible: true });
    await expect(
      reader.getByText("archiveproof body 0", { exact: true }),
    ).toBeVisible();
    await expect(
      reader.getByText("This conversation may be incomplete."),
    ).toBeVisible();
    const deliveryStatus = reader.getByRole("region", {
      name: "Reply delivery status",
    });
    await expect(deliveryStatus.getByRole("status")).toHaveCount(0);
    await expect(deliveryStatus.getByRole("alert")).toHaveCount(0);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "persistent-reader-offline",
    );
    await reader
      .getByRole("button", { name: "Back to inbox", exact: true })
      .click();
    await page
      .getByRole("option")
      .filter({ has: page.getByText("Indexed message 1", { exact: true }) })
      .click();
    await expect(
      reader.getByText("This message hasn’t loaded yet."),
    ).toBeVisible();
    await reader.getByRole("button", { name: "Forward", exact: true }).click();
    await expect(
      reader.getByRole("button", {
        name: "Load message to forward",
        exact: true,
      }),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "persistent-reader-missing-body",
    );
  } finally {
    await rm(workerFile, { force: true });
  }
});

test("keeps two accounts isolated while searching their persistent indexes offline", async ({
  page,
  context,
}, testInfo) => {
  await page.route("**/api/mobile/mailbox-sync", (route) => route.abort());
  const { emailAccountId } = await openMail(page);
  const secondary = await createSecondEmailAccount(emailAccountId);
  try {
    await page.goto(`/${secondary.id}/mail`);
    await expect(page.getByPlaceholder("Search mail")).toBeVisible();
    await seedSearchCache(page, secondary.id);
    await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    await expect(page.getByPlaceholder("Search mail")).toBeVisible();
    await seedSearchCache(page, emailAccountId);
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const db = await new Promise<IDBDatabase>((resolve) => {
              const request = indexedDB.open("inbox-zero-email-cache");
              request.onsuccess = () => resolve(request.result);
            });
            const request = db
              .transaction("searchIndexWork")
              .objectStore("searchIndexWork")
              .count();
            const count = await new Promise<number>((resolve) => {
              request.onsuccess = () => resolve(request.result);
            });
            db.close();
            return count;
          }),
        { timeout: 90_000 },
      )
      .toBe(0);
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("inbox-zero-email-cache");
        request.onsuccess = () => resolve(request.result);
      });
      const tx = db.transaction(
        ["threadRows", "threadDetails", "mailboxMessages"],
        "readwrite",
      );
      for (const name of ["threadRows", "threadDetails", "mailboxMessages"])
        tx.objectStore(name).clear();
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
      });
      db.close();
    });
    await context.setOffline(true);
    await page.getByPlaceholder("Search mail").fill("needle");
    await expect(
      page.getByRole("option").filter({
        has: page.getByText("Cached body search result", { exact: true }),
      }),
    ).toHaveCount(2);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "persistent-search-two-accounts-offline",
    );
  } finally {
    await deleteSecondEmailAccount(secondary.accountId);
  }
});
