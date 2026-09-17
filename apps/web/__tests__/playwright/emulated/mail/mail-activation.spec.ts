import { expect, type Page } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import { withClient } from "./mail-test-helpers";

test("starts downloads only after visiting Mail and resumes the activated account after reload", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const secondAccount = await createSecondEmailAccount(emailAccountId);
  const syncAccountIds = new Set<string>();

  page.on("request", (request) => {
    if (!request.headers()["next-action"]) return;
    try {
      const payload: unknown = request.postDataJSON();
      if (
        Array.isArray(payload) &&
        typeof payload[0] === "string" &&
        payload[1] &&
        typeof payload[1] === "object" &&
        "phase" in payload[1]
      )
        syncAccountIds.add(payload[0]);
    } catch {
      // Other actions may submit multipart form data.
    }
  });

  try {
    await page.goto(`/${emailAccountId}/assistant`);
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
    });
    // Give mounted background effects time to expose unintended downloads.
    await page.waitForTimeout(1500);
    expect([...syncAccountIds]).toEqual([]);
    expect(await readSyncAccounts(page, "searchIndexAccounts")).toEqual([]);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "assistant-without-mail-downloads",
    );

    await page.goto(`/${emailAccountId}/mail`);
    await expect(
      page.getByRole("combobox", { name: "Search mail" }),
    ).toBeVisible();
    await expect.poll(() => [...syncAccountIds]).toEqual([emailAccountId]);
    // Sync ticks are gated on the storage ledger being ready, so readiness
    // always precedes the first download and hasMessages is the field this
    // poll waits on. Dropping it would pass on a sync that downloads nothing.
    await expect
      .poll(
        () =>
          page.evaluate(async (id) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open("inbox-zero-email-cache");
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            try {
              const tx = db.transaction([
                "localMailStorageLedger",
                "localMailMessages",
                "localMailSyncStates",
              ]);
              const read = <T>(request: IDBRequest<T>) =>
                new Promise<T>((resolve, reject) => {
                  request.onsuccess = () => resolve(request.result);
                  request.onerror = () => reject(request.error);
                });
              const [ledger, count, state] = await Promise.all([
                read(tx.objectStore("localMailStorageLedger").get("origin")),
                read(
                  tx
                    .objectStore("localMailMessages")
                    .index("byAccount")
                    .count(id),
                ),
                read(tx.objectStore("localMailSyncStates").get(id)),
              ]);
              return {
                indexReady: ledger?.index.status === "ready",
                sourcesReady:
                  !!ledger &&
                  Object.values(ledger.stores).every(
                    (store) =>
                      !!store &&
                      typeof store === "object" &&
                      "complete" in store &&
                      store.complete,
                  ),
                hasMessages: count > 0,
                storagePaused: !!state?.storagePaused,
              };
            } finally {
              db.close();
            }
          }, emailAccountId),
        { timeout: 20_000 },
      )
      .toEqual({
        indexReady: true,
        sourcesReady: true,
        hasMessages: true,
        storagePaused: false,
      });
    await expect
      .poll(() => readSyncAccounts(page, "localMailSyncStates"))
      .toEqual([emailAccountId]);
    await expect(
      page
        .getByRole("listbox", { name: "Conversations" })
        .or(page.getByText("No emails in this view", { exact: true })),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(page, testInfo, "mail-activated");

    syncAccountIds.clear();
    await page.goto(`/${emailAccountId}/assistant`);
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (id) => localStorage.getItem(`inbox-zero:mail-activation:${id}`),
          emailAccountId,
        ),
      )
      .toBe("1");
    syncAccountIds.clear();
    await page.reload();
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (id) => localStorage.getItem(`inbox-zero:mail-activation:${id}`),
          emailAccountId,
        ),
      )
      .toBe("1");
    expect([...syncAccountIds].every((id) => id === emailAccountId)).toBe(true);

    await withClient((client) =>
      client.query(
        'UPDATE "EmailAccount" SET "includeInAllAccounts" = false WHERE id = $1',
        [secondAccount.id],
      ),
    );
    await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    await expect(
      page.getByRole("combobox", { name: "Search mail" }),
    ).toBeVisible();
    expect(syncAccountIds.has(secondAccount.id)).toBe(false);

    await withClient((client) =>
      client.query(
        'UPDATE "EmailAccount" SET "includeInAllAccounts" = true WHERE id = $1',
        [secondAccount.id],
      ),
    );
    await page.reload();
    await expect.poll(() => syncAccountIds.has(secondAccount.id)).toBe(true);
    await expect(
      page
        .getByRole("listbox", { name: "Conversations" })
        .or(page.getByText("No emails in this view", { exact: true })),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(page, testInfo, "unified-mail-activated");
  } finally {
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});

async function readSyncAccounts(
  page: Page,
  store: "searchIndexAccounts" | "localMailSyncStates",
) {
  return page.evaluate(async (storeName) => {
    const databases = await indexedDB.databases();
    if (
      !databases.some((database) => database.name === "inbox-zero-email-cache")
    )
      return [];
    return new Promise<string[]>((resolve, reject) => {
      const request = indexedDB.open("inbox-zero-email-cache");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.close();
          resolve([]);
          return;
        }
        const transaction = database.transaction(storeName, "readonly");
        const rows = transaction.objectStore(storeName).getAll();
        rows.onerror = () => reject(rows.error);
        transaction.oncomplete = () => {
          database.close();
          resolve(
            rows.result
              .filter(
                (row) => storeName !== "localMailSyncStates" || row.strategy,
              )
              .map((row) => row.emailAccountId),
          );
        };
      };
    });
  }, store);
}
