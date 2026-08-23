import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

const MESSAGE_COUNT = 5000;
const FIRST_LOCAL_SUBJECT = "Local mailbox load test 0";
const PRIMARY_UNIFIED_SUBJECT = "Primary local unified conversation";
const SECONDARY_UNIFIED_SUBJECT = "Secondary local unified conversation";

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

test("renders and isolates two locally cached accounts without server mail requests", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  const secondAccount = await createSecondEmailAccount(emailAccountId);
  const syncAccountIds = new Set<string>();

  try {
    await page.route("**/api/threads/all?**", (route) =>
      route.abort("connectionfailed"),
    );
    await page.route("**/api/mobile/mailbox-sync", async (route) => {
      const syncAccountId = await route
        .request()
        .headerValue("X-Email-Account-ID");
      if (syncAccountId) syncAccountIds.add(syncAccountId);
      await route.abort("connectionfailed");
    });
    await seedUnifiedMailbox(page, emailAccountId, secondAccount.id);

    await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    const conversations = page.getByRole("listbox", {
      name: "Conversations",
    });
    await expect(conversations).toBeVisible();
    await expect(
      conversationWithSubject(page, conversations, PRIMARY_UNIFIED_SUBJECT),
    ).toBeVisible();
    await expect(
      conversationWithSubject(page, conversations, SECONDARY_UNIFIED_SUBJECT),
    ).toBeVisible();
    await expect(conversations.getByRole("option")).toHaveCount(2);
    await expect(page.getByLabel(`Inbox: ${secondAccount.name}`)).toBeVisible();
    await expect
      .poll(() => [...syncAccountIds].sort())
      .toEqual([emailAccountId, secondAccount.id].sort());

    await testInfo.attach("local-unified-mailbox", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  } finally {
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
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

async function seedUnifiedMailbox(
  page: Page,
  primaryAccountId: string,
  secondaryAccountId: string,
) {
  await page.evaluate(
    async ({ primaryAccountId, secondaryAccountId, subjects }) => {
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
          const accounts = [
            {
              emailAccountId: primaryAccountId,
              receivedAt: now - 1000,
              subject: subjects.primary,
            },
            {
              emailAccountId: secondaryAccountId,
              receivedAt: now,
              subject: subjects.secondary,
            },
          ];
          const messages = transaction.objectStore("mailboxMessages");
          const states = transaction.objectStore("mailboxSyncStates");
          for (const account of accounts) {
            const internalDate = new Date(account.receivedAt).toISOString();
            const messageId = `${account.emailAccountId}-shared-message`;
            const threadId = "shared-thread";
            messages.put({
              data: {
                date: internalDate,
                headers: {
                  date: internalDate,
                  from: `Unified Sender <${account.emailAccountId}@example.com>`,
                  subject: account.subject,
                  to: "playwright-test@gmail.com",
                },
                id: messageId,
                internalDate,
                labelIds: ["INBOX", "UNREAD"],
                snippet: `${account.subject} snippet`,
                subject: account.subject,
                threadId,
              },
              emailAccountId: account.emailAccountId,
              lastAccessedAt: now,
              messageId,
              receivedAt: account.receivedAt,
              threadId,
            });
            states.put({
              after: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
              completedAt: now,
              cursor: `${account.emailAccountId}-cursor`,
              emailAccountId: account.emailAccountId,
              hasMore: false,
              lastSyncedAt: now,
            });
          }
        };
      });
    },
    {
      primaryAccountId,
      secondaryAccountId,
      subjects: {
        primary: PRIMARY_UNIFIED_SUBJECT,
        secondary: SECONDARY_UNIFIED_SUBJECT,
      },
    },
  );
}

async function createSecondEmailAccount(primaryEmailAccountId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const suffix = randomUUID();
  const accountId = `playwright-account-${suffix}`;
  const id = `playwright-email-account-${suffix}`;
  const email = `playwright-secondary-${suffix}@gmail.com`;
  const name = "Playwright Secondary";

  try {
    await client.query("BEGIN");
    const userResult = await client.query<{ userId: string }>(
      `SELECT "userId" FROM "EmailAccount" WHERE id = $1`,
      [primaryEmailAccountId],
    );
    const userId = userResult.rows[0]?.userId;
    if (!userId) throw new Error("Could not find the Playwright account user");

    await client.query(
      `INSERT INTO "Account"
        (id, "createdAt", "updatedAt", "userId", provider, type, "providerAccountId")
       VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, 'google', 'oidc', $3)`,
      [accountId, userId, `playwright-provider-${suffix}`],
    );
    await client.query(
      `INSERT INTO "EmailAccount"
        (id, email, name, "createdAt", "updatedAt", "userId", "accountId")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4, $5)`,
      [id, email, name, userId, accountId],
    );
    await client.query("COMMIT");
    return { accountId, email, id, name };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function deleteSecondEmailAccount(accountId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DELETE FROM "Account" WHERE id = $1`, [accountId]);
  } finally {
    await client.end();
  }
}
