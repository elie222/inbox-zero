import { build } from "esbuild";
import { rm } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("opens saved mail offline, reconnects, and clears it on sign-out", async ({
  page,
  context,
}, testInfo) => {
  const { conversations } = await openMail(page);
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

    await context.setOffline(false);
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
