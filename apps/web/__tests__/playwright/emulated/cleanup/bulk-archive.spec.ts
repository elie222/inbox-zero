import { expect, test, type Page, type Route } from "@playwright/test";
import {
  conversationWithSubject,
  readLatestMailMutation,
} from "../mail/mail-test-helpers";
import {
  CLEANUP_ARCHIVE_THREAD_ID,
  CLEANUP_BLOCK_THREAD_ID,
  CLEANUP_KEEP_THREAD_ID,
  cleanUpFixture,
  type CleanupFixture,
  openCleanupFeature,
  prepareCleanupFixture,
  restoreCleanupThreads,
} from "./cleanup-test-helpers";

const ARCHIVE_SENDER = "cleanup-archive@example.com";
const ARCHIVE_SUBJECT = "Cleanup Category Archive Candidate";
const KEEP_SUBJECT = "Cleanup Category Keep Candidate";
const BULK_ARCHIVE_THREAD_IDS = [
  CLEANUP_ARCHIVE_THREAD_ID,
  CLEANUP_KEEP_THREAD_ID,
];
const CLEANUP_MAILBOX_THREAD_IDS = [
  CLEANUP_BLOCK_THREAD_ID,
  ...BULK_ARCHIVE_THREAD_IDS,
];
let fixture: CleanupFixture | undefined;

test.beforeEach(async ({ page }) => {
  fixture = undefined;
  fixture = await prepareCleanupFixture(page);
  await restoreFixtureThreads(page, fixture.emailAccountId);
});

test.afterEach(async ({ page }) => {
  if (!fixture) return;
  try {
    await restoreFixtureThreads(page, fixture.emailAccountId);
  } finally {
    await cleanUpFixture(fixture);
  }
});

test("rehydrates an interrupted sender archive and completes after reconnect", async ({
  page,
}) => {
  test.setTimeout(360_000);
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  await stubMailboxSync(page, fixture.emailAccountId);
  await openCleanupFeature(page, fixture, "bulk-archive");
  await selectOnlyArchiveSender(page);

  try {
    await page.route("**/*", blockServerActions);
    await newsletterCard(page)
      .getByRole("button", { name: "Archive 1 of 2" })
      .click();

    await expect
      .poll(() =>
        readLatestMailMutation(page, {
          emailAccountId: fixture?.emailAccountId ?? "",
          kind: "archive",
          sender: ARCHIVE_SENDER,
          threadId: CLEANUP_ARCHIVE_THREAD_ID,
        }),
      )
      .toMatchObject({
        clientSource: { kind: "sender", sender: ARCHIVE_SENDER },
        status: "retry_wait",
      });

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Bulk Archive" }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText("Archiving 1 of 1 senders...", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("0 / 1", { exact: true })).toBeVisible();

    await page.unroute("**/*", blockServerActions);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(
        () =>
          readLatestMailMutation(page, {
            emailAccountId: fixture?.emailAccountId ?? "",
            kind: "archive",
            sender: ARCHIVE_SENDER,
            threadId: CLEANUP_ARCHIVE_THREAD_ID,
          }),
        { timeout: 60_000 },
      )
      .toMatchObject({ status: "succeeded" });

    await assertOnlySelectedSenderWasRemovedFromInbox(page, fixture);
  } finally {
    await page.unroute("**/*", blockServerActions);
  }
});

test("marks a selected sender read through the durable sender queue", async ({
  page,
}) => {
  test.setTimeout(360_000);
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  await stubMailboxSync(page, fixture.emailAccountId);

  try {
    await openCleanupFeature(page, fixture, "bulk-archive");
    await chooseBulkAction(page, "Mark as read");
    await selectOnlyArchiveSender(page);
    await newsletterCard(page)
      .getByRole("button", { name: "Mark 1 of 2 as read" })
      .click();

    await expect
      .poll(
        () =>
          readLatestMailMutation(page, {
            emailAccountId: fixture?.emailAccountId ?? "",
            kind: "set_read_state",
            sender: ARCHIVE_SENDER,
            threadId: CLEANUP_ARCHIVE_THREAD_ID,
          }),
        { timeout: 60_000 },
      )
      .toMatchObject({ payload: { read: true }, status: "succeeded" });
    await expect(
      page.getByText("Marked 1 read!", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        getThreadLabelIds(
          page,
          fixture?.emailAccountId ?? "",
          CLEANUP_ARCHIVE_THREAD_ID,
        ),
      )
      .not.toContain("UNREAD");
  } finally {
    await restoreUnreadState(page, fixture);
  }
});

test("deletes a selected sender through the durable sender queue", async ({
  page,
}) => {
  test.setTimeout(360_000);
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  const mailboxSync = await stubMailboxSync(page, fixture.emailAccountId);
  await openCleanupFeature(page, fixture, "bulk-archive");
  await chooseBulkAction(page, "Delete");
  await selectOnlyArchiveSender(page);

  mailboxSync.expectDeleted(CLEANUP_ARCHIVE_THREAD_ID);
  page.once("dialog", (dialog) => dialog.accept());
  await newsletterCard(page)
    .getByRole("button", { name: "Delete 1 of 2" })
    .click();

  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId: fixture?.emailAccountId ?? "",
          kind: "trash",
          sender: ARCHIVE_SENDER,
          threadId: CLEANUP_ARCHIVE_THREAD_ID,
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ status: "succeeded" });
  await expect(page.getByText("Deleted 1!", { exact: true })).toBeVisible();
  await assertOnlySelectedSenderWasRemovedFromInbox(page, fixture);
});

async function selectOnlyArchiveSender(page: Page) {
  const card = newsletterCard(page);
  await card.click();
  await expect(
    page.getByText("2 of 2 selected", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Cleanup Keep" }).click();
  await expect(
    page.getByText("1 of 2 selected", { exact: true }),
  ).toBeVisible();
}

async function chooseBulkAction(page: Page, action: "Delete" | "Mark as read") {
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", {
    name: "Bulk Archive Settings",
  });
  await settings.getByRole("combobox").click();
  await page.getByRole("option", { name: action }).click();
  await settings.getByRole("button", { name: "Close" }).click();
}

async function assertOnlySelectedSenderWasRemovedFromInbox(
  page: Page,
  cleanupFixture: CleanupFixture,
) {
  await openCleanupFeature(page, cleanupFixture, "mail");
  const conversations = page.getByRole("listbox", { name: "Conversations" });
  await expect(conversations).toBeVisible({ timeout: 120_000 });
  await expect(
    conversationWithSubject(page, conversations, ARCHIVE_SUBJECT),
  ).toHaveCount(0);
  await expect(
    conversationWithSubject(page, conversations, KEEP_SUBJECT),
  ).toBeVisible();
}

async function restoreUnreadState(page: Page, cleanupFixture: CleanupFixture) {
  await openCleanupFeature(page, cleanupFixture, "mail");
  const conversations = page.getByRole("listbox", { name: "Conversations" });
  const conversation = conversationWithSubject(
    page,
    conversations,
    ARCHIVE_SUBJECT,
  );
  await expect(conversation).toBeVisible();
  await conversation.click();
  await page.getByRole("button", { name: /^More actions/ }).click();
  const markUnread = page.getByRole("menuitem", { name: "Mark as unread" });
  const markRead = page.getByRole("menuitem", { name: "Mark as read" });
  await expect(markUnread.or(markRead)).toBeVisible();
  if (await markUnread.isVisible()) {
    await markUnread.click();
    await expect
      .poll(() =>
        getThreadLabelIds(
          page,
          cleanupFixture.emailAccountId,
          CLEANUP_ARCHIVE_THREAD_ID,
        ),
      )
      .toContain("UNREAD");
  } else {
    await page.keyboard.press("Escape");
  }
}

async function getThreadLabelIds(
  page: Page,
  emailAccountId: string,
  threadId: string,
) {
  const response = await page.request.get(`/api/threads/${threadId}`, {
    headers: { "X-Email-Account-ID": emailAccountId },
  });
  if (!response.ok()) {
    throw new Error(`Thread request failed with ${response.status()}`);
  }
  const result = (await response.json()) as {
    thread: { messages: { labelIds?: string[] }[] };
  };
  return Array.from(
    new Set(
      result.thread.messages.flatMap((message) => message.labelIds ?? []),
    ),
  );
}

function newsletterCard(page: Page) {
  return page
    .locator('[role="button"]')
    .filter({ has: page.getByRole("heading", { name: "Newsletter" }) });
}

function blockServerActions(route: Route) {
  const request = route.request();
  if (request.method() === "POST" && request.headers()["next-action"]) {
    return route.abort("connectionfailed");
  }
  return route.fallback();
}

async function restoreFixtureThreads(page: Page, emailAccountId: string) {
  for (const threadId of BULK_ARCHIVE_THREAD_IDS) {
    await expect
      .poll(
        async () => {
          try {
            const response = await page.request.post(
              `/api/threads/${threadId}/untrash`,
              { headers: { "X-Email-Account-ID": emailAccountId } },
            );
            return response.ok();
          } catch {
            return false;
          }
        },
        { timeout: 120_000 },
      )
      .toBe(true);
  }
  await restoreCleanupThreads(page, emailAccountId, BULK_ARCHIVE_THREAD_IDS);
}

async function stubMailboxSync(page: Page, emailAccountId: string) {
  const initialThreads = await getCleanupMailboxThreads(
    page,
    emailAccountId,
    CLEANUP_MAILBOX_THREAD_IDS,
  );
  const deletedThreadIds = new Set<string>();

  await page.route("**/api/mobile/mailbox-sync", async (route) => {
    const expectedThreadIds = CLEANUP_MAILBOX_THREAD_IDS.filter(
      (threadId) => !deletedThreadIds.has(threadId),
    );
    const threads = await getCleanupMailboxThreads(
      page,
      emailAccountId,
      expectedThreadIds,
    );
    const returnedThreadIds = new Set(threads.map((thread) => thread.id));
    const deletedMessageIds = initialThreads
      .filter(
        (thread) =>
          deletedThreadIds.has(thread.id) && !returnedThreadIds.has(thread.id),
      )
      .flatMap((thread) => thread.messages.map((message) => message.id));

    await route.fulfill({
      body: JSON.stringify({
        accountId: emailAccountId,
        cursor: "playwright-cleanup-sync",
        deletedMessageIds,
        hasMore: false,
        reset: false,
        upsertedMessages: threads.flatMap((thread) => thread.messages),
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  return {
    expectDeleted(threadId: string) {
      deletedThreadIds.add(threadId);
    },
  };
}

async function getCleanupMailboxThreads(
  page: Page,
  emailAccountId: string,
  expectedThreadIds: string[],
) {
  let threads: { id: string; messages: { id: string }[] }[] | undefined;
  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get(
            `/api/threads/batch?threadIds=${CLEANUP_MAILBOX_THREAD_IDS.join(",")}`,
            { headers: { "X-Email-Account-ID": emailAccountId } },
          );
          if (!response.ok()) return false;

          const result = (await response.json()) as {
            threads: { id: string; messages: { id: string }[] }[];
          };
          const returnedThreadIds = new Set(
            result.threads.map((thread) => thread.id),
          );
          if (
            !expectedThreadIds.every((threadId) =>
              returnedThreadIds.has(threadId),
            )
          ) {
            return false;
          }

          threads = result.threads;
          return true;
        } catch {
          return false;
        }
      },
      { timeout: 120_000 },
    )
    .toBe(true);

  if (!threads?.length) {
    throw new Error("Mailbox thread request returned no threads");
  }
  return threads;
}
