import { expect, test, type Page } from "@playwright/test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

const MESSAGE_COUNT = 5000;
const FIRST_LOCAL_SUBJECT = "Local mailbox load test 0";
const PRIMARY_UNIFIED_SUBJECT = "Primary local unified conversation";
const SECONDARY_UNIFIED_SUBJECT = "Secondary local unified conversation";
const THREAD_DETAIL_VARIANT = "drafts:1|replies:0";
const WARM_READER_BODY = "Cached reader body from IndexedDB";
const COLD_READER_BODY = "Network reader body after cache miss";
const REFRESHED_READER_BODY = "Fresh reader body after revalidation";

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

test("opens the owning account's cached reader in place from All Accounts", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  const secondAccount = await createSecondEmailAccount(emailAccountId);
  const secondaryReaderBody = "Secondary account cached reader body";

  try {
    await page.route("**/api/threads/all?**", (route) =>
      route.abort("connectionfailed"),
    );
    await page.route(threadDetailRoute("shared-thread"), (route) =>
      route.abort("connectionfailed"),
    );
    await seedUnifiedMailbox(page, emailAccountId, secondAccount.id);
    await seedThreadDetail(page, {
      emailAccountId,
      textPlain: "Primary account cached reader body",
      threadId: "shared-thread",
    });
    await seedThreadDetail(page, {
      emailAccountId: secondAccount.id,
      textPlain: secondaryReaderBody,
      threadId: "shared-thread",
    });

    await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    const conversations = page.getByRole("listbox", {
      name: "Conversations",
    });
    await expect(
      conversationWithSubject(page, conversations, SECONDARY_UNIFIED_SUBJECT),
    ).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__combinedReaderWindow =
        true;
    });

    await conversationWithSubject(
      page,
      conversations,
      SECONDARY_UNIFIED_SUBJECT,
    ).click();

    await expect(readerBody(page, secondaryReaderBody)).toBeVisible();
    await expect(page).toHaveURL(/accountScope=all/);
    await expect(page).toHaveURL(/thread-id=shared-thread/);
    await expect(page).toHaveURL(
      new RegExp(`thread-account-id=${escapeRegExp(secondAccount.id)}`),
    );
    expect(
      await page.evaluate(
        () =>
          (window as unknown as Record<string, unknown>).__combinedReaderWindow,
      ),
    ).toBe(true);
    await testInfo.attach("all-accounts-cached-reader", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await page.getByRole("button", { name: /^Back/ }).click();
    await expect(conversations).toBeVisible();
    await expect(page).not.toHaveURL(/thread-id=/);
    await expect(page).not.toHaveURL(/thread-account-id=/);
  } finally {
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});

test("renders a cached thread body when the reader request is offline", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const threadId = await openFirstThread(page, conversations);
  await seedThreadDetail(page, {
    emailAccountId,
    textPlain: WARM_READER_BODY,
    threadId,
  });

  await page.route(threadDetailRoute(threadId), (route) =>
    route.abort("connectionfailed"),
  );
  await page.reload();

  await expect(readerBody(page, WARM_READER_BODY)).toBeVisible();
  await testInfo.attach("cached-thread-reader", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("falls back to the network for an uncached thread body and persists it", async ({
  page,
}) => {
  const { conversations, emailAccountId } = await openMail(page);
  const threadId = await openFirstThread(page, conversations);
  await clearThreadDetail(page, { emailAccountId, threadId });

  await page.route(threadDetailRoute(threadId), async (route) => {
    await route.fulfill({
      body: JSON.stringify(
        getThreadDetailResponse({
          textPlain: COLD_READER_BODY,
          threadId,
        }),
      ),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.reload();

  await expect(readerBody(page, COLD_READER_BODY)).toBeVisible();
  await expect
    .poll(() => readThreadDetailTextPlain(page, { emailAccountId, threadId }))
    .toBe(COLD_READER_BODY);
});

test("shows cached reader content immediately and refreshes it from the network", async ({
  page,
}) => {
  const { conversations, emailAccountId } = await openMail(page);
  const threadId = await openFirstThread(page, conversations);
  const network = Promise.withResolvers<void>();

  await seedThreadDetail(page, {
    emailAccountId,
    textPlain: WARM_READER_BODY,
    threadId,
  });
  await page.route(threadDetailRoute(threadId), async (route) => {
    await network.promise;
    await route.fulfill({
      body: JSON.stringify(
        getThreadDetailResponse({
          textPlain: REFRESHED_READER_BODY,
          threadId,
        }),
      ),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.reload();

  await expect(readerBody(page, WARM_READER_BODY)).toBeVisible();
  network.resolve();
  await expect(readerBody(page, REFRESHED_READER_BODY)).toBeVisible();
  await expect
    .poll(() => readThreadDetailTextPlain(page, { emailAccountId, threadId }))
    .toBe(REFRESHED_READER_BODY);
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
                labelIds: ["INBOX"],
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

async function openFirstThread(
  page: Page,
  conversations: ReturnType<Page["getByRole"]>,
) {
  await conversations.getByRole("option").first().click();
  const threadId = new URL(page.url()).searchParams.get("thread-id");
  if (!threadId) throw new Error("Expected an open thread id");
  return threadId;
}

async function seedThreadDetail(
  page: Page,
  {
    emailAccountId,
    threadId,
    textPlain,
  }: {
    emailAccountId: string;
    threadId: string;
    textPlain: string;
  },
) {
  const data = getThreadDetailResponse({ textPlain, threadId });
  await page.evaluate(
    async ({ byteSize, data, emailAccountId, threadId, variant }) => {
      await new Promise<void>((resolve, reject) => {
        const openRequest = indexedDB.open("inbox-zero-email-cache");
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction(
            "threadDetails",
            "readwrite",
          );
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          const now = Date.now();
          transaction.objectStore("threadDetails").put({
            byteSize,
            data,
            emailAccountId,
            fetchedAt: now,
            lastAccessedAt: now,
            threadId,
            variant,
          });
        };
      });
    },
    {
      byteSize: JSON.stringify(data).length,
      data,
      emailAccountId,
      threadId,
      variant: THREAD_DETAIL_VARIANT,
    },
  );
}

async function clearThreadDetail(
  page: Page,
  {
    emailAccountId,
    threadId,
  }: {
    emailAccountId: string;
    threadId: string;
  },
) {
  await page.evaluate(
    async ({ emailAccountId, threadId, variant }) => {
      await new Promise<void>((resolve, reject) => {
        const openRequest = indexedDB.open("inbox-zero-email-cache");
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction(
            "threadDetails",
            "readwrite",
          );
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction
            .objectStore("threadDetails")
            .delete([emailAccountId, threadId, variant]);
        };
      });
    },
    { emailAccountId, threadId, variant: THREAD_DETAIL_VARIANT },
  );
}

async function readThreadDetailTextPlain(
  page: Page,
  {
    emailAccountId,
    threadId,
  }: {
    emailAccountId: string;
    threadId: string;
  },
) {
  return page.evaluate(
    async ({ emailAccountId, threadId, variant }) =>
      await new Promise<string | undefined>((resolve, reject) => {
        const openRequest = indexedDB.open("inbox-zero-email-cache");
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction("threadDetails", "readonly");
          transaction.onerror = () => reject(transaction.error);
          const request = transaction
            .objectStore("threadDetails")
            .get([emailAccountId, threadId, variant]);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            database.close();
            resolve(request.result?.data?.thread?.messages?.[0]?.textPlain);
          };
        };
      }),
    { emailAccountId, threadId, variant: THREAD_DETAIL_VARIANT },
  );
}

function getThreadDetailResponse({
  threadId,
  textPlain,
}: {
  threadId: string;
  textPlain: string;
}) {
  const date = "2026-08-23T10:00:00.000Z";
  return {
    thread: {
      historyId: "history-1",
      id: threadId,
      messages: [
        {
          date,
          headers: {
            date,
            from: "reader-cache@example.com",
            subject: textPlain,
            to: "playwright-test@gmail.com",
          },
          historyId: "history-1",
          id: `${threadId}-message`,
          inline: [],
          snippet: textPlain,
          subject: textPlain,
          textPlain,
          threadId,
        },
      ],
      snippet: textPlain,
    },
  };
}

function threadDetailRoute(threadId: string) {
  return new RegExp(
    `/api/threads/${escapeRegExp(encodeURIComponent(threadId))}(?:\\?.*)?$`,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readerBody(page: Page, text: string) {
  return page
    .locator("pre")
    .filter({ hasText: new RegExp(`^${escapeRegExp(text)}$`) });
}
