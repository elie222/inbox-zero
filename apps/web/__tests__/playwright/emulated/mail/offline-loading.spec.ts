import { build } from "esbuild";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { conversationWithSubject, openMail } from "./mail-test-helpers";
import { MAIL_ENGINE_OPFS_DIRECTORY } from "@/utils/mail-engine/wasm-sqlite";

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
  const extraAssets = new Set<string>();
  const onResponse = (response: {
    url(): string;
    status(): number;
    request(): { resourceType(): string };
  }) => {
    if (response.status() !== 200) return;
    collectMailEngineAsset(
      extraAssets,
      response.url(),
      response.request().resourceType(),
    );
  };
  context.on("response", onResponse);
  const { conversations } = await openMail(page);
  await expect(
    conversationWithSubject(page, conversations, "Archive Action Message"),
  ).toBeVisible();
  const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
  const workerName = production ? "sw.js" : `sw-offline-test-${process.pid}.js`;
  const workerFile = path.resolve("public", workerName);
  try {
    // Dev mode has no precache manifest; production uses the worker built for CI.
    // Dedicated workers import sqlite-wasm JS off the page resource timeline.
    const origin = new URL(page.url()).origin;
    let precacheUrls: string[] = [];
    if (!production) {
      await expect.poll(() => [...extraAssets].some(isWasmUrl)).toBe(true);
      const pageAssets = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => {
            const parsed = new URL(url);
            return (
              parsed.origin === location.origin &&
              parsed.pathname.startsWith("/_next/static/")
            );
          }),
      );
      precacheUrls = [
        ...new Set(
          [...pageAssets, ...extraAssets]
            .map((url) => toPrecacheUrl(url, origin))
            .filter((url): url is string => Boolean(url)),
        ),
      ];
      await build({
        entryPoints: ["app/sw.ts"],
        bundle: true,
        define: {
          "process.env.NODE_ENV": JSON.stringify("production"),
          "self.__SW_MANIFEST": JSON.stringify(
            precacheUrls.map((url) => ({ url, revision: null })),
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
    }, workerName);
    if (!production) {
      await page.evaluate(async (urls) => {
        await Promise.all(
          urls.map((url) =>
            fetch(url, { credentials: "same-origin", cache: "reload" }).catch(
              () => undefined,
            ),
          ),
        );
      }, precacheUrls);
    }
    await expect
      .poll(() =>
        page.evaluate(async () => {
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            for (const request of await cache.keys()) {
              if (new URL(request.url).pathname.endsWith(".wasm")) return true;
            }
          }
          return false;
        }),
      )
      .toBe(true);
    await page.evaluate(() => {
      navigator.serviceWorker.controller?.postMessage({
        type: "inbox-zero:save-offline-mail",
      });
    });
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

    // Wait for the engine mailbox to have metadata coverage before going offline.
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const inspect = window.__inboxZeroMailInspect;
            if (!inspect?.read) return false;
            const diagnostics = (await inspect.read()) as {
              coverage?: Array<{ metadata?: string }>;
            };
            return diagnostics.coverage?.some(
              (item) => item.metadata === "complete",
            );
          }),
        { timeout: 90_000 },
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

    await expect.poll(() => mailEngineOpfsExists(page)).toBe(true);
    await page
      .locator('[data-sidebar="footer"]')
      .getByRole("button")
      .filter({ hasText: /playwright-test\+/i })
      .click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect.poll(() => mailEngineOpfsExists(page)).toBe(false);
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
    context.off("response", onResponse);
    await context.setOffline(false);
    if (!production) await rm(workerFile, { force: true });
  }
});

function collectMailEngineAsset(
  extraAssets: Set<string>,
  url: string,
  resourceType: string,
) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
  if (
    parsed.pathname.includes("hot-update") ||
    parsed.pathname.endsWith(".map")
  )
    return;
  if (
    parsed.pathname.startsWith("/_next/static/") ||
    parsed.pathname.endsWith(".wasm") ||
    parsed.pathname.endsWith(".mjs") ||
    resourceType === "worker" ||
    resourceType === "script" ||
    resourceType === "stylesheet"
  ) {
    extraAssets.add(url);
  }
}

function toPrecacheUrl(url: string, origin: string) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== origin) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function isWasmUrl(url: string) {
  try {
    return new URL(url).pathname.endsWith(".wasm");
  } catch {
    return false;
  }
}

async function mailEngineOpfsExists(page: Page) {
  return page.evaluate(async (directory) => {
    const root = await navigator.storage.getDirectory();
    try {
      await root.getDirectoryHandle(directory);
      return true;
    } catch {
      return false;
    }
  }, MAIL_ENGINE_OPFS_DIRECTORY);
}
