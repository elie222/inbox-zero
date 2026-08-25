import { expect, test, type Page, type Route } from "@playwright/test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

const ARCHIVE_SUBJECT = "Archive Action Message";
const ARCHIVE_THREAD_ID = "thr_playwright_archive";
const REPLY_SUBJECT = "Reply Workflow Message";
const REPLY_THREAD_ID = "thr_playwright_reply";

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
  const blockServerActions = (route: Route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      return route.abort("connectionfailed");
    }
    return route.fallback();
  };

  try {
    await page.route("**/*", blockServerActions);
    await conversation
      .getByRole("checkbox", { name: "Select conversation from Erin Example" })
      .click();
    await page.getByRole("button", { name: /^Archive E$/ }).click();

    await expect(conversation).toHaveCount(0);
    await expect
      .poll(() =>
        readMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: ARCHIVE_THREAD_ID,
        }),
      )
      .toMatchObject({ status: "retry_wait" });

    await page.reload();
    const reloadedConversations = page.getByRole("listbox", {
      name: "Conversations",
    });
    await expect(reloadedConversations).toBeVisible();
    await expect(
      conversationWithSubject(page, reloadedConversations, ARCHIVE_SUBJECT),
    ).toHaveCount(0);
    await testInfo.attach("durable-archive-after-reload", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await page.unroute("**/*", blockServerActions);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(
        () =>
          readMailMutation(page, {
            emailAccountId,
            kind: "archive",
            threadId: ARCHIVE_THREAD_ID,
          }),
        { timeout: 60_000 },
      )
      .toMatchObject({ status: "succeeded" });
  } finally {
    await page.unroute("**/*", blockServerActions);
    await page.request.post(`/api/threads/${ARCHIVE_THREAD_ID}/unarchive`, {
      headers: { "X-Email-Account-ID": emailAccountId },
    });
  }
});

test("keeps a reply queued across reload and sends it after reconnect", async ({
  page,
}, testInfo) => {
  await stubMailboxSync(page);
  const { conversations, emailAccountId } = await openMail(page);
  await conversationWithSubject(page, conversations, REPLY_SUBJECT).click();
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
    await page.getByRole("button", { name: /^Reply R$/ }).click();
    const editor = page.locator("[contenteditable='true']");
    await editor.pressSequentially(replyBody);
    await page.getByRole("button", { name: /^Send/ }).click();

    await expect(
      page.getByText("Email queued. It will send when you're back online.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        readMailMutation(page, {
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
        readMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: REPLY_THREAD_ID,
        }),
      )
      .toMatchObject({ status: "pending" });
    await testInfo.attach("durable-reply-after-reload", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    const queuedReply = await readMailMutation(page, {
      emailAccountId,
      kind: "reply",
      threadId: REPLY_THREAD_ID,
    });
    expect(queuedReply?.id).toEqual(expect.any(String));
    await expect(
      page.evaluate(
        async ({ accountId, mutationId }) => {
          const response = await fetch(
            `/api/mail-mutation-receipts/${mutationId}`,
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
        readMailMutation(page, {
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
          readMailMutation(page, {
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
    await setNavigatorOnline(page, true);
  }
});

async function readMailMutation(
  page: Page,
  expected: { emailAccountId: string; kind: string; threadId: string },
) {
  try {
    return await page.evaluate(
      async (match) =>
        await new Promise<Record<string, unknown> | undefined>(
          (resolve, reject) => {
            const openRequest = indexedDB.open("inbox-zero-email-cache");
            openRequest.onerror = () => reject(openRequest.error);
            openRequest.onsuccess = () => {
              const database = openRequest.result;
              if (!database.objectStoreNames.contains("mailMutations")) {
                database.close();
                resolve(undefined);
                return;
              }
              const transaction = database.transaction(
                "mailMutations",
                "readonly",
              );
              transaction.onerror = () => reject(transaction.error);
              const request = transaction.objectStore("mailMutations").getAll();
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                database.close();
                resolve(
                  request.result
                    .filter(
                      (mutation) =>
                        mutation.emailAccountId === match.emailAccountId &&
                        mutation.kind === match.kind &&
                        mutation.threadId === match.threadId,
                    )
                    .sort((left, right) => right.createdAt - left.createdAt)[0],
                );
              };
            };
          },
        ),
      expected,
    );
  } catch (error) {
    if (String(error).includes("Execution context was destroyed")) {
      return;
    }
    throw error;
  }
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
