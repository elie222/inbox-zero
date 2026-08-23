import { expect, test, type Page } from "@playwright/test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

const MESSAGE_COUNT = 5000;
const FIRST_LOCAL_SUBJECT = "Local mailbox load test 0";

test("renders a large local mailbox while server mail requests are unavailable", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);

  await page.route("**/api/threads?**", (route) =>
    route.abort("connectionfailed"),
  );
  await page.route("**/api/mobile/mailbox-sync", (route) =>
    route.abort("connectionfailed"),
  );
  await seedLargeMailbox(page, emailAccountId);

  const startedAt = Date.now();
  await page.reload();
  await expect(
    conversationWithSubject(page, conversations, FIRST_LOCAL_SUBJECT),
  ).toBeVisible({ timeout: 5000 });
  const localReadyMs = Date.now() - startedAt;

  await testInfo.attach("local-mailbox-performance", {
    body: JSON.stringify(
      { localReadyMs, messageCount: MESSAGE_COUNT },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await testInfo.attach("large-local-mailbox", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

async function seedLargeMailbox(page: Page, emailAccountId: string) {
  await page.evaluate(
    async ({ accountId, messageCount }) => {
      await new Promise<void>((resolve, reject) => {
        const openRequest = indexedDB.open("inbox-zero-email-cache");
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction(
            ["mailboxMessages", "mailboxSyncStates"],
            "readwrite",
          );
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };

          const now = Date.now();
          const messages = transaction.objectStore("mailboxMessages");
          for (let index = 0; index < messageCount; index += 1) {
            const receivedAt = now - index * 1000;
            const internalDate = new Date(receivedAt).toISOString();
            const messageId = `local-load-message-${index}`;
            const threadId = `local-load-thread-${index}`;
            const subject = `Local mailbox load test ${index}`;
            messages.put({
              data: {
                date: internalDate,
                headers: {
                  date: internalDate,
                  from: `Load Tester ${index} <load-${index}@example.com>`,
                  subject,
                  to: "playwright-test@gmail.com",
                },
                id: messageId,
                internalDate,
                labelIds: ["INBOX", "UNREAD"],
                snippet: `Local mailbox snippet ${index}`,
                subject,
                threadId,
              },
              emailAccountId: accountId,
              lastAccessedAt: now,
              messageId,
              receivedAt,
              threadId,
            });
          }
          transaction.objectStore("mailboxSyncStates").put({
            after: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
            completedAt: now,
            cursor: "local-load-cursor",
            emailAccountId: accountId,
            hasMore: false,
            lastSyncedAt: now,
          });
        };
      });
    },
    { accountId: emailAccountId, messageCount: MESSAGE_COUNT },
  );
}
