import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  conversationWithSubject,
  openMail,
  readLatestMailMutation,
} from "./mail-test-helpers";

const THREAD_ID = "thr_playwright_archive";
const SUBJECT = "Archive Action Message";

test("keeps an archive hidden while mailbox sync has older pages remaining", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(page, conversations, SUBJECT);
  await expect(conversation).toHaveCount(1);
  const response = await page.request.get(`/api/threads/${THREAD_ID}`, {
    headers: { "X-Email-Account-ID": emailAccountId },
  });
  expect(response.ok()).toBe(true);
  const { thread } = await response.json();
  const messageIds = thread.messages.map(
    (message: { id: string }) => message.id,
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          async (accountId) =>
            new Promise<boolean>((resolve, reject) => {
              const request = indexedDB.open("inbox-zero-email-cache");
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const database = request.result;
                const transaction = database.transaction("mailboxSyncStates");
                const state = transaction
                  .objectStore("mailboxSyncStates")
                  .get(accountId);
                state.onsuccess = () =>
                  resolve(state.result?.hasMore === false);
                state.onerror = () => reject(state.error);
                transaction.oncomplete = () => database.close();
              };
            }),
          emailAccountId,
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
  const finalPage = Promise.withResolvers<void>();
  let syncRequests = 0;

  await page.route("**/api/mobile/mailbox-sync", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    syncRequests += 1;
    if (syncRequests === 1) {
      // An older page may still contain the messages removed by the archive.
      await route.fulfill({
        response,
        json: { ...body, hasMore: true, upsertedMessages: thread.messages },
      });
      return;
    }
    await finalPage.promise;
    await route.fulfill({
      response,
      json: {
        ...body,
        hasMore: false,
        deletedMessageIds: [...body.deletedMessageIds, ...messageIds],
        upsertedMessages: body.upsertedMessages.filter(
          (message: { id: string }) => !messageIds.includes(message.id),
        ),
      },
    });
  });

  try {
    await conversation.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect.poll(() => syncRequests).toBeGreaterThanOrEqual(2);
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: THREAD_ID,
        }),
      )
      .toMatchObject({ status: "reconciling" });
    await expect(conversation).toHaveCount(0);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "archive-awaiting-final-page",
    );

    finalPage.resolve();
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: THREAD_ID,
        }),
      )
      .toMatchObject({ status: "succeeded" });
    await expect(conversation).toHaveCount(0);
    await capturePlaywrightCheckpoint(page, testInfo, "archive-reconciled");
  } finally {
    finalPage.resolve();
    await page.unrouteAll({ behavior: "wait" });
    await page.request.post(`/api/threads/${THREAD_ID}/unarchive`, {
      headers: { "X-Email-Account-ID": emailAccountId },
    });
  }
});
