import { expect, type Page } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import {
  clearMailMutations,
  conversationWithSubject,
  openMail,
  readLatestMailMutation,
} from "./mail-test-helpers";

const ARCHIVE_SUBJECT = "Archive Action Message";
const ARCHIVE_THREAD_ID = "thr_playwright_archive";
const REPLY_SUBJECT = "Reply Workflow Message";
const REPLY_THREAD_ID = "thr_playwright_reply";
const ISOLATED_THREAD_ID = "playwright-account-isolation-thread";
const PRIMARY_ISOLATION_SUBJECT = "Primary durable mutation control";
const SECONDARY_ISOLATION_SUBJECT = "Secondary durable mutation target";

test("keeps a queued archive hidden across reload and replays it after reconnect", async ({
  page,
}, testInfo) => {
  await stubMailboxSync(page);
  const { conversations, emailAccountId } = await openMail(page);
  const conversation = conversationWithSubject(
    page,
    conversations,
    ARCHIVE_SUBJECT,
  );
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => localStorage.getItem("playwright-mail-online") !== "false",
    });
  });
  await setNavigatorOnline(page, false);

  try {
    await conversation
      .getByRole("checkbox", { name: "Select conversation with Erin Example" })
      .click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();

    await expect(conversation).toHaveCount(0);
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: ARCHIVE_THREAD_ID,
        }),
      )
      .toMatchObject({ status: "pending" });

    await page.reload();
    const reloadedConversations = page.getByRole("listbox", {
      name: "Conversations",
    });
    await expect(reloadedConversations).toBeVisible();
    await expect(
      conversationWithSubject(page, reloadedConversations, ARCHIVE_SUBJECT),
    ).toHaveCount(0);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "durable-archive-after-reload",
    );

    await setNavigatorOnline(page, true);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(
        () =>
          readLatestMailMutation(page, {
            emailAccountId,
            kind: "archive",
            threadId: ARCHIVE_THREAD_ID,
          }),
        { timeout: 60_000 },
      )
      .toMatchObject({ status: "succeeded" });
  } finally {
    await setNavigatorOnline(page, true);
    await page.request.post(`/api/threads/${ARCHIVE_THREAD_ID}/unarchive`, {
      headers: { "X-Email-Account-ID": emailAccountId },
    });
  }
});

test("keeps a reply queued across reload and sends it after reconnect", async ({
  page,
}, testInfo) => {
  await stubMailboxSync(page);
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=${REPLY_THREAD_ID}`);
  await expect(
    page.getByText("Please reply to this seeded conversation."),
  ).toBeVisible({ timeout: 60_000 });
  const sentByMe = page.getByText("Me", { exact: true });
  const initialSentByMeCount = await sentByMe.count();
  const replyBody = `Durable offline reply ${Date.now()}`;
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => localStorage.getItem("playwright-mail-online") !== "false",
    });
  });
  await setNavigatorOnline(page, false);

  try {
    await page
      .getByRole("button", { name: "Reply", exact: true })
      .last()
      .click();
    const editor = page.locator("[contenteditable='true']");
    await editor.pressSequentially(replyBody);
    await page.getByRole("button", { name: "Send", exact: true }).click();

    await expect(
      page.getByText("Email queued. It will send when you're back online.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: REPLY_THREAD_ID,
        }),
      )
      .toMatchObject({ status: "pending" });

    await page.reload();
    await expect(
      page.getByRole("heading", { name: REPLY_SUBJECT }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: REPLY_THREAD_ID,
        }),
      )
      .toMatchObject({ status: "pending" });
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "durable-reply-after-reload",
    );

    const queuedReply = await readLatestMailMutation(page, {
      emailAccountId,
      kind: "reply",
      threadId: REPLY_THREAD_ID,
    });
    expect(queuedReply?.id).toEqual(expect.any(String));
    await expect(
      page.evaluate(
        async ({ accountId, mutationId }) => {
          const response = await fetch(
            `/api/email-send-operations/${mutationId}`,
            { headers: { "X-Email-Account-ID": accountId } },
          );
          return response.json();
        },
        { accountId: emailAccountId, mutationId: String(queuedReply?.id) },
      ),
    ).resolves.toEqual({ status: "missing" });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: REPLY_SUBJECT }),
    ).toBeVisible();
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: REPLY_THREAD_ID,
        }),
      )
      .toMatchObject({ status: "pending" });

    await setNavigatorOnline(page, true);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(
        () =>
          readLatestMailMutation(page, {
            emailAccountId,
            kind: "reply",
            threadId: REPLY_THREAD_ID,
          }),
        { timeout: 60_000 },
      )
      .toMatchObject({
        result: { messageId: expect.any(String), threadId: expect.any(String) },
        status: "succeeded",
      });
    await clearThreadDetails(page, emailAccountId, REPLY_THREAD_ID);
    await page.reload();
    await expect(sentByMe).toHaveCount(initialSentByMeCount + 1);
  } finally {
    await restoreNavigatorOnline(page);
  }
});

test("keeps a unified-mailbox mutation isolated to its owning account", async ({
  page,
}) => {
  const { emailAccountId } = await openMail(page);
  const secondAccount = await createSecondEmailAccount(emailAccountId);

  try {
    await page.route("**/api/threads/all?**", (route) =>
      route.abort("connectionfailed"),
    );
    await page.route("**/api/mobile/mailbox-sync", (route) =>
      route.abort("connectionfailed"),
    );
    await seedAccountIsolationMailbox(page, emailAccountId, secondAccount.id);
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        get: () => localStorage.getItem("playwright-mail-online") !== "false",
      });
    });
    await setNavigatorOnline(page, false);

    await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    const conversations = page.getByRole("listbox", {
      name: "Conversations",
    });
    const primaryConversation = conversationWithSubject(
      page,
      conversations,
      PRIMARY_ISOLATION_SUBJECT,
    );
    const secondaryConversation = conversationWithSubject(
      page,
      conversations,
      SECONDARY_ISOLATION_SUBJECT,
    );
    await expect(primaryConversation).toBeVisible();
    await expect(secondaryConversation).toBeVisible();

    await secondaryConversation.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(secondaryConversation).toHaveCount(0);
    await expect(primaryConversation).toBeVisible();
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId: secondAccount.id,
          kind: "archive",
          threadId: ISOLATED_THREAD_ID,
        }),
      )
      .toMatchObject({ status: "pending" });
    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: ISOLATED_THREAD_ID,
        }),
      )
      .toBeUndefined();

    await page.reload();
    await expect(primaryConversation).toBeVisible();
    await expect(secondaryConversation).toHaveCount(0);
  } finally {
    try {
      await clearMailMutations(page, {
        emailAccountId: secondAccount.id,
        threadId: ISOLATED_THREAD_ID,
      });
    } finally {
      try {
        await setNavigatorOnline(page, true);
      } finally {
        await deleteSecondEmailAccount(secondAccount.accountId);
      }
    }
  }
});

function seedAccountIsolationMailbox(
  page: Page,
  primaryAccountId: string,
  secondaryAccountId: string,
) {
  return page.evaluate(
    async ({ primaryAccountId, secondaryAccountId, threadId, subjects }) =>
      await new Promise<void>((resolve, reject) => {
        const openRequest = indexedDB.open("inbox-zero-email-cache");
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const requiredStores = ["mailboxMessages", "mailboxSyncStates"];
          const missingStores = requiredStores.filter(
            (store) => !database.objectStoreNames.contains(store),
          );
          if (missingStores.length) {
            database.close();
            reject(
              new Error(`Missing object stores: ${missingStores.join(", ")}`),
            );
            return;
          }
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
          const states = transaction.objectStore("mailboxSyncStates");
          for (const [index, account] of [
            {
              emailAccountId: primaryAccountId,
              subject: subjects.primary,
            },
            {
              emailAccountId: secondaryAccountId,
              subject: subjects.secondary,
            },
          ].entries()) {
            const receivedAt = now - index * 1000;
            const internalDate = new Date(receivedAt).toISOString();
            const messageId = `${account.emailAccountId}-isolation-message`;
            messages.put({
              data: {
                date: internalDate,
                headers: {
                  date: internalDate,
                  from: "Unified Sender <unified@example.com>",
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
              receivedAt,
              threadId,
            });
            states.put({
              after: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
              completedAt: now,
              cursor: `${account.emailAccountId}-isolation-cursor`,
              emailAccountId: account.emailAccountId,
              hasMore: false,
              lastSyncedAt: now,
            });
          }
        };
      }),
    {
      primaryAccountId,
      secondaryAccountId,
      subjects: {
        primary: PRIMARY_ISOLATION_SUBJECT,
        secondary: SECONDARY_ISOLATION_SUBJECT,
      },
      threadId: ISOLATED_THREAD_ID,
    },
  );
}

function setNavigatorOnline(page: Page, online: boolean) {
  return page.evaluate((value) => {
    localStorage.setItem("playwright-mail-online", String(value));
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => localStorage.getItem("playwright-mail-online") !== "false",
    });
  }, online);
}

async function restoreNavigatorOnline(page: Page) {
  try {
    await setNavigatorOnline(page, true);
  } catch (error) {
    if (!page.isClosed()) throw error;
  }
}

function clearThreadDetails(
  page: Page,
  emailAccountId: string,
  threadId: string,
) {
  return page.evaluate(
    async ({ accountId, id }) =>
      await new Promise<void>((resolve, reject) => {
        const openRequest = indexedDB.open("inbox-zero-email-cache");
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          if (!database.objectStoreNames.contains("threadDetails")) {
            database.close();
            resolve();
            return;
          }
          const transaction = database.transaction(
            "threadDetails",
            "readwrite",
          );
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          const store = transaction.objectStore("threadDetails");
          const request = store.openCursor();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            const value = cursor.value;
            if (value.emailAccountId === accountId && value.threadId === id) {
              cursor.delete();
            }
            cursor.continue();
          };
        };
      }),
    { accountId: emailAccountId, id: threadId },
  );
}

function stubMailboxSync(page: Page) {
  return page.route("**/api/mobile/mailbox-sync", async (route) => {
    const emailAccountId = await route
      .request()
      .headerValue("X-Email-Account-ID");
    await route.fulfill({
      body: JSON.stringify({
        accountId: emailAccountId,
        cursor: "playwright-durable-sync",
        deletedMessageIds: [],
        hasMore: false,
        reset: false,
        upsertedMessages: [],
      }),
      contentType: "application/json",
      status: 200,
    });
  });
}
