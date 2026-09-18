import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { SEARCH_INDEX_VERSION } from "@/utils/email-cache/search-index-version";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("bounds opened attachment previews and reuses them offline", async ({
  page,
  context,
}, testInfo) => {
  let downloads = 0;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGPQKnpKU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULAIMZBFtzIGK3AAAAAElFTkSuQmCC",
    "base64",
  );
  await page.route("**/api/messages/attachment?**", async (route) => {
    if (new URL(route.request().url()).searchParams.has("emailAccountId")) {
      await route.continue();
      return;
    }
    downloads++;
    await route.fulfill({ contentType: "image/png", body: png });
  });
  const { conversations, emailAccountId } = await openMail(page);
  await page.getByPlaceholder("Search mail").fill("Reader Visual");
  await expect(
    conversationWithSubject(page, conversations, "Re: Reader Visual Message"),
  ).toBeVisible();
  await page.getByPlaceholder("Search mail").fill("");
  await page.evaluate(
    async ({ size, emailAccountId, sourceVersion }) => {
      const response = await fetch(
        "/api/threads/thr_playwright_reader_visual",
        { headers: { "X-Email-Account-ID": emailAccountId } },
      );
      const { thread } = await response.json();
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("inbox-zero-email-cache");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = database.transaction(
        ["localMailMessages", "searchIndexAccounts"],
        "readwrite",
      );
      // Attachment downloads resolve the account generation first and report a
      // missing row as stale, so seed it here rather than rely on activation
      // having already run. The current source version keeps the runtime from
      // migrating the account and discarding the rows below.
      const accounts = tx.objectStore("searchIndexAccounts");
      const existingAccount = accounts.get(emailAccountId);
      existingAccount.onsuccess = () => {
        if (!existingAccount.result)
          accounts.put({
            emailAccountId,
            generation: crypto.randomUUID(),
            sourceVersion,
          });
      };
      const store = tx.objectStore("localMailMessages");
      const messages = thread.messages;
      for (const message of messages) {
        store.put({
          emailAccountId,
          messageId: message.id,
          threadId: thread.id,
          receivedAt: Number(message.internalDate),
          fetchedAt: Date.now() + 60_000,
          bodyFetchedAt: Date.now() + 60_000,
          lastAccessedAt: Date.now(),
          byteSize: 0,
          data: message,
        });
      }
      const message = messages.at(-1);
      const providerAttachment = message.attachments.find(
        (file: { filename: string }) => file.filename === "reader-preview.png",
      );
      if (!providerAttachment)
        throw new Error("Missing provider attachment fixture");
      const row = {
        emailAccountId,
        messageId: message.id,
        threadId: thread.id,
        receivedAt: Number(message.internalDate),
        fetchedAt: Date.now() + 60_000,
        bodyFetchedAt: Date.now() + 60_000,
        lastAccessedAt: Date.now(),
        byteSize: 0,
        data: message,
      };
      const attachment = (attachmentId: string, bytes: number) => ({
        attachmentId,
        filename: `${attachmentId}.png`,
        mimeType: "image/png",
        size: bytes,
        headers: {
          "content-description": "",
          "content-id": `<${attachmentId}>`,
          "content-type": "image/png",
          "content-transfer-encoding": "base64",
        },
      });
      row.fetchedAt = row.bodyFetchedAt = Date.now() + 60_000;
      row.data.textHtml =
        '<p>Attachment preview checks.</p><img src="cid:preview-inline" />';
      row.data.inline = [attachment("preview-inline", size)];
      row.data.attachments = [
        attachment("preview-file", size),
        attachment("preview-large", 2 * 1024 * 1024),
        { ...providerAttachment, filename: "preview-unknown.png", size: 0 },
      ];
      store.put(row);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { size: png.length, emailAccountId, sourceVersion: SEARCH_INDEX_VERSION },
  );
  const row = conversationWithSubject(
    page,
    conversations,
    "Re: Reader Visual Message",
  );
  await row.click();
  try {
    await expect(page.getByAltText("preview-file.png")).toBeVisible();
  } catch (error) {
    const diagnostic = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("inbox-zero-email-cache");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const result: Record<string, unknown> = {
        quota: await navigator.storage.estimate(),
        visibility: document.visibilityState,
        online: navigator.onLine,
      };
      for (const name of [
        "searchIndexAccounts",
        "localMailStorageLedger",
        "localMailAttachmentFiles",
        "localMailAttachmentJobs",
        "localMailThreadProtection",
      ])
        result[name] = await new Promise((resolve, reject) => {
          const request = database.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      database.close();
      return result;
    });
    await testInfo.attach("attachment-diagnostics", {
      body: JSON.stringify({ downloads, diagnostic }),
      contentType: "application/json",
    });
    throw error;
  }
  await expect.poll(() => downloads).toBe(2);
  await expect(page.getByAltText("preview-file.png")).toHaveJSProperty(
    "naturalWidth",
    32,
  );
  await expect(
    page
      .frameLocator('iframe[title="Email content preview"]')
      .last()
      .locator("img"),
  ).toHaveJSProperty("naturalWidth", 32);
  await expect(page.getByAltText("preview-large.png")).toHaveCount(0);
  await expect(page.getByAltText("preview-unknown.png")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page
    .getByText("preview-file.png", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Download" })
    .click();
  expect((await download).suggestedFilename()).toBe("preview-file.png");
  expect(downloads).toBe(2);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-bounded-attachment-previews",
  );
  const nativeDownload = page.waitForEvent("download");
  await page
    .getByText("preview-unknown.png", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Download" })
    .click();
  const savedFile = await nativeDownload;
  expect(savedFile.suggestedFilename()).toBe("preview-unknown.png");
  expect(await savedFile.failure()).toBeNull();
  expect(new URL(savedFile.url()).searchParams.get("emailAccountId")).toBe(
    emailAccountId,
  );
  const savedPath = await savedFile.path();
  expect(savedPath).not.toBeNull();
  const savedBytes = await readFile(savedPath!);
  expect(savedBytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(downloads).toBe(2);
  await context.setOffline(true);
  await page.keyboard.press("Escape");
  await expect(page.getByAltText("preview-file.png")).toHaveCount(0);
  await row.click();
  await expect(page.getByAltText("preview-file.png")).toBeVisible();
  expect(downloads).toBe(2);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-cached-attachment-offline",
  );
});
