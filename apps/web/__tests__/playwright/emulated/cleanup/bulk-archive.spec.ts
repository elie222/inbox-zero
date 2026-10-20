import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
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
  markMarketingInboxRead,
  restoreCleanupThreads,
  seedBulkArchiveCounts,
} from "./cleanup-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";

const ARCHIVE_SENDER = "cleanup-archive@example.com";
const KEEP_SENDER = "cleanup-keep@example.com";
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

  let releaseExecute = () => {};
  const held = new Promise<void>((resolve) => {
    releaseExecute = resolve;
  });
  await page.route(
    "**/api/mail/v1/accounts/**/operations/**",
    async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      await held;
      await route.continue();
    },
  );

  try {
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
        status: "reconciling",
      });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Bulk Archive" }),
    ).toBeVisible({ timeout: 60_000 });
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
        status: "reconciling",
      });

    releaseExecute();
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
    releaseExecute();
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

test("orders categories by read rate with one lead button and shows inbox and unread counts", async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  await stubMailboxSync(page, fixture.emailAccountId);
  await seedCounts(page, fixture);
  await openCleanupFeature(page, fixture, "bulk-archive");

  await expect
    .poll(async () =>
      (await page.getByRole("heading", { level: 2 }).allTextContents()).slice(
        0,
        5,
      ),
    )
    .toEqual(["Newsletter", "Marketing", "Notification", "Other", "Receipt"]);
  await expect(
    page.getByRole("button", { name: "Archive all", exact: true }),
  ).toHaveCount(1);
  await expect(
    newsletterCard(page).getByRole("button", { name: "Archive all" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review First", exact: true }),
  ).toHaveCount(4);
  await expect(newsletterCard(page)).toContainText("2 in inbox · 2 unread");
  await expect(marketingCard(page)).toContainText("3 in inbox · 1 unread");
  await expectHeaderCount(page, "5");
  await capturePlaywrightCheckpoint(page, testInfo, "bulk-archive-counts-idle");

  await marketingCard(page)
    .getByRole("button", { name: "Review First" })
    .click();
  await expect(
    page.getByText("1 of 1 selected", { exact: true }),
  ).toBeVisible();
  await expect(
    marketingCard(page).getByRole("button", { name: "Archive 1 of 1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Archive all", exact: true }),
  ).toHaveCount(1);
});

test("holds the archived result with Undo and moves the header number", async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  await stubMailboxSync(page, fixture.emailAccountId);
  await seedCounts(page, fixture);
  await openCleanupFeature(page, fixture, "bulk-archive");
  await expectHeaderCount(page, "5");

  await newsletterCard(page)
    .getByRole("button", { name: "Archive all" })
    .click();

  await expect(newsletterCard(page)).toContainText("2 archived");
  await expect(
    newsletterCard(page).getByRole("button", { name: "Undo" }),
  ).toBeVisible();
  await expect(page.getByText("was 5 · 2 archived just now")).toBeVisible();
  await expectHeaderCount(page, "3");
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "bulk-archive-counts-archived",
  );

  // The result lives in the header and the row; no second "complete" bar.
  await expect(page.getByText(/senders processed/)).toHaveCount(0);

  // The refetch after the archive finishes keeps the held result and the number.
  await expect(newsletterCard(page)).toContainText("2 archived", {
    timeout: 30_000,
  });
  await expectHeaderCount(page, "3");

  await newsletterCard(page).getByRole("button", { name: "Undo" }).click();
  await expect(
    newsletterCard(page).getByRole("button", { name: "Archive all" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(newsletterCard(page)).toContainText("2 in inbox · 2 unread", {
    timeout: 30_000,
  });
  await expectHeaderCount(page, "5");
});

test("refreshes the counts and the updated time on demand", async ({
  page,
}) => {
  test.setTimeout(360_000);
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  await stubMailboxSync(page, fixture.emailAccountId);
  await seedCounts(page, fixture);
  await openCleanupFeature(page, fixture, "bulk-archive");
  await expect(marketingCard(page)).toContainText("3 in inbox · 1 unread");
  await expect(page.getByText("Updated just now")).toBeVisible();

  await markMarketingInboxRead(fixture);
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(marketingCard(page)).toContainText("3 in inbox · 0 unread");
  await expect(page.getByText("Updated just now")).toBeVisible();
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
  const threadActions = page.getByRole("group", { name: "Thread actions" });
  const markUnread = threadActions.getByRole("button", {
    name: /Mark as unread/,
  });
  const markRead = threadActions.getByRole("button", {
    name: /Mark as read/,
  });
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

function marketingCard(page: Page) {
  return page
    .locator('[role="button"]')
    .filter({ has: page.getByRole("heading", { name: "Marketing" }) });
}

async function expectHeaderCount(page: Page, count: string) {
  await expect(
    page.getByText("In your inbox from these senders").locator(".."),
  ).toContainText(count);
}

async function seedCounts(page: Page, cleanupFixture: CleanupFixture) {
  const mailboxMessages: {
    from: string;
    messageId: string;
    threadId: string;
  }[] = [];
  for (const [from, threadId] of [
    [ARCHIVE_SENDER, CLEANUP_ARCHIVE_THREAD_ID],
    [KEEP_SENDER, CLEANUP_KEEP_THREAD_ID],
  ]) {
    const response = await page.request.get(`/api/threads/${threadId}`, {
      headers: { "X-Email-Account-ID": cleanupFixture.emailAccountId },
    });
    const { thread } = (await response.json()) as {
      thread: { messages: { id: string }[] };
    };
    for (const message of thread.messages) {
      mailboxMessages.push({ from, messageId: message.id, threadId });
    }
  }
  await seedBulkArchiveCounts(cleanupFixture, mailboxMessages);
}

function newsletterCard(page: Page) {
  return page
    .locator('[role="button"]')
    .filter({ has: page.getByRole("heading", { name: "Newsletter" }) });
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
