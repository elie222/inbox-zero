import { expect } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";

test("inspects an account's local queue and refreshes its progress", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
  });
  await page.goto(`/${emailAccountId}/debug`);
  await page.getByRole("link", { name: "Mail queue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mail queue", exact: true }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("No actions match this status.")).toBeVisible();
  await page.evaluate(async (accountId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("inbox-zero-email-cache");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("mailMutations", "readwrite");
    const store = transaction.objectStore("mailMutations");
    for (let index = 0; index < 201; index++) {
      store.put({
        id: `queue-diagnostics-${index}`,
        batchId: "queue-diagnostics-batch",
        emailAccountId: index === 200 ? "another-account" : accountId,
        threadId: `queue-thread-${index}`,
        messageIds: [`queue-message-${index}`],
        kind: "archive",
        payload: {},
        status: "pending",
        attempts: 0,
        createdAt: Date.now() - index,
        updatedAt: Date.now(),
        nextAttemptAt: Date.now(),
      });
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, emailAccountId);
  await expect(
    page.getByText("Batches: 1 · Message operations: 200"),
  ).toBeVisible();
  await expect(page.getByText("Showing 50 of 200 actions")).toBeVisible();
  await page.getByText("Inspect action", { exact: true }).first().click();
  await expect(
    page.getByText("queue-diagnostics-0", { exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-queue-pending");
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(page.getByText("Showing 100 of 200 actions")).toBeVisible();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("inbox-zero-email-cache");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("mailMutations", "readwrite");
    const store = transaction.objectStore("mailMutations");
    const request = store.get("queue-diagnostics-0");
    request.onsuccess = () =>
      store.put({
        ...request.result,
        status: "retry_wait",
        attempts: 2,
        nextAttemptAt: Date.now() + 60_000,
        lastError: "Provider temporarily unavailable",
      });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await page
    .getByRole("option", { name: "Waiting to retry", exact: false })
    .click();
  await expect(page.getByText("Showing 1 of 1 actions")).toBeVisible();
  const details = page.locator("details").first();
  if (
    !(await details.evaluate((element) => (element as HTMLDetailsElement).open))
  ) {
    await details.locator("summary").click();
  }
  await expect(
    page.getByText("Provider temporarily unavailable", { exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-queue-retry");
  await page.setViewportSize({ width: 390, height: 844 });
  await capturePlaywrightCheckpoint(page, testInfo, "mail-queue-mobile");
});
