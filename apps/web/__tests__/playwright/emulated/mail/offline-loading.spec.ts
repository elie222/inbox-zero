import { build } from "esbuild";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("preserves bootstrap fragments for precached workers online and offline", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_PRODUCTION === "1",
    "Production validates the bundled search worker in the offline mailbox reload test.",
  );
  const prefix = `worker-cache-test-${process.pid}`;
  const files = [`${prefix}.html`, `${prefix}.js`, `${prefix}-sw.js`];
  try {
    await writeFile(
      path.resolve("public", files[0]),
      "<html><body>Worker cache test</body></html>",
    );
    await writeFile(
      path.resolve("public", files[1]),
      "self.postMessage(self.location.hash);",
    );
    await build({
      entryPoints: ["app/sw.ts"],
      bundle: true,
      define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
        "self.__SW_MANIFEST": JSON.stringify([
          { url: `/${files[1]}`, revision: null },
        ]),
      },
      outfile: path.resolve("public", files[2]),
    });
    await page.goto(`/${files[0]}`);
    await page.evaluate(async (worker) => {
      await navigator.serviceWorker.register(`/${worker}`, { scope: "/" });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => resolve(),
            { once: true },
          ),
        );
    }, files[2]);
    for (const offline of [false, true]) {
      await context.setOffline(offline);
      const fragment = await page.evaluate(
        (worker) =>
          new Promise<string>((resolve, reject) => {
            const instance = new Worker(`/${worker}#params=bootstrap-config`);
            instance.onmessage = (event) => {
              instance.terminate();
              resolve(event.data);
            };
            instance.onerror = () => {
              instance.terminate();
              reject(new Error("Cached worker failed"));
            };
          }),
        files[1],
      );
      expect(fragment).toBe("#params=bootstrap-config");
    }
  } finally {
    await context.setOffline(false);
    await Promise.all(
      files.map((file) => rm(path.resolve("public", file), { force: true })),
    );
  }
});

test("opens saved mail offline, reconnects, and clears it on sign-out", async ({
  page,
  context,
}, testInfo) => {
  // Keep seeded messages inside the first current-first sync window.
  await page.clock.install({ time: new Date("2025-01-02T12:00:00.000Z") });
  const { conversations, emailAccountId } = await openMail(page);
  await expect(
    conversationWithSubject(page, conversations, "Archive Action Message"),
  ).toBeVisible();
  const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
  const workerName = production ? "sw.js" : `sw-offline-test-${process.pid}.js`;
  const workerFile = path.resolve("public", workerName);
  try {
    // Dev mode has no precache manifest; production uses the worker built for CI.
    if (!production) {
      const assets = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter(
            (url) =>
              new URL(url).origin === location.origin &&
              new URL(url).pathname.startsWith("/_next/static/"),
          ),
      );
      await build({
        entryPoints: ["app/sw.ts"],
        bundle: true,
        define: {
          "process.env.NODE_ENV": JSON.stringify("production"),
          "self.__SW_MANIFEST": JSON.stringify(
            [...new Set(assets)].map((url) => ({ url, revision: null })),
          ),
        },
        outfile: workerFile,
      });
    }

    await page.evaluate(async (name) => {
      await navigator.serviceWorker.register(`/${name}`, { scope: "/" });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => resolve(),
            { once: true },
          ),
        );
      }
      navigator.serviceWorker.controller?.postMessage({
        type: "inbox-zero:save-offline-mail",
      });
    }, workerName);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const name = (await caches.keys()).find((name) =>
            name.startsWith("inbox-zero:offline-mail:"),
          );
          if (!name) return false;
          const cache = await caches.open(name);
          return (
            Boolean(await cache.match(location.origin + location.pathname)) &&
            Boolean(
              await cache.match(`${location.origin}/api/user/email-accounts`),
            )
          );
        }),
      )
      .toBe(true);

    // Source coverage and the asynchronous index must both be durable before going offline.
    await expect
      .poll(() =>
        page.evaluate(
          (accountId) =>
            new Promise<boolean>((resolve) => {
              const request = indexedDB.open("inbox-zero-email-cache");
              request.onerror = () => resolve(false);
              request.onupgradeneeded = () => request.transaction?.abort();
              request.onsuccess = () => {
                const database = request.result;
                if (
                  !database.objectStoreNames.contains("localMailSyncStates")
                ) {
                  database.close();
                  resolve(false);
                  return;
                }
                const transaction = database.transaction([
                  "localMailSyncStates",
                  "searchIndexAccounts",
                  "searchIndexWork",
                  "localMailMessages",
                ]);
                const state = transaction
                  .objectStore("localMailSyncStates")
                  .get(accountId);
                const account = transaction
                  .objectStore("searchIndexAccounts")
                  .get(accountId);
                const work = transaction
                  .objectStore("searchIndexWork")
                  .index("byAccount")
                  .count(accountId);
                const messages = transaction
                  .objectStore("localMailMessages")
                  .getAll();
                transaction.oncomplete = () => {
                  database.close();
                  resolve(
                    messages.result.some(
                      (message) =>
                        message.emailAccountId === accountId &&
                        message.data.headers.subject ===
                          "Archive Action Message",
                    ) &&
                      Boolean(state.result?.coverage) &&
                      account.result?.generation === state.result?.generation &&
                      !account.result?.seed &&
                      work.result === 0,
                  );
                };
                transaction.onerror = () => {
                  database.close();
                  resolve(false);
                };
              };
            }),
          emailAccountId,
        ),
      )
      .toBe(true);

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
    await expect(conversations).toBeVisible();
    await expect(
      conversationWithSubject(page, conversations, "Archive Action Message"),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "mail-after-real-offline-reload",
    );

    if (production) {
      const search = page.getByPlaceholder("Search mail");
      await search.fill('subject:"Archive Action Message"');
      await expect(
        conversationWithSubject(page, conversations, "Archive Action Message"),
      ).toBeVisible();
      await expect(
        conversationWithSubject(
          page,
          conversations,
          "Keyboard Navigation Message",
        ),
      ).toHaveCount(0);
      await capturePlaywrightCheckpoint(
        page,
        testInfo,
        "local-search-after-offline-reload",
      );
      await page.getByRole("button", { name: "Clear search" }).click();
    }

    await context.setOffline(false);
    // Confirm the browser can reach the server before testing a connected reload.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          try {
            const response = await fetch("/api/auth/ok", {
              cache: "no-store",
              signal: AbortSignal.timeout(3000),
            });
            return response.ok;
          } catch {
            return false;
          }
        }),
      )
      .toBe(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
    await expect(
      conversationWithSubject(page, conversations, "Archive Action Message"),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(page, testInfo, "mail-after-reconnect");

    const signOutStatus = await page.evaluate(async () => {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      return response.status;
    });
    expect(signOutStatus).toBe(200);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const names = (await caches.keys()).filter((name) =>
            name.startsWith("inbox-zero:offline-mail:"),
          );
          const entries = await Promise.all(
            names.map(
              async (name) => (await (await caches.open(name)).keys()).length,
            ),
          );
          return entries.reduce((count, size) => count + size, 0);
        }),
      )
      .toBe(0);
  } finally {
    await context.setOffline(false);
    if (!production) await rm(workerFile, { force: true });
  }
});
