import path from "node:path";
import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { Client } from "pg";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { readLatestMailMutation } from "./mail-test-helpers";

const commandModifier = process.platform === "darwin" ? "Meta" : "Control";
const SIDE_PANEL_ARCHIVE_MESSAGE_ID = "msg_playwright_archive";
const SIDE_PANEL_ARCHIVE_SUBJECT = "Archive Action Message";
const SIDE_PANEL_ARCHIVE_THREAD_ID = "thr_playwright_archive";
const SEEDED_THREAD_IDS = [
  "thr_playwright_1",
  "thr_playwright_2",
  "thr_playwright_3",
];
let emailAccountIdForCleanup: string | undefined;

test.afterEach(async ({ request }) => {
  if (emailAccountIdForCleanup) {
    const emailAccountId = emailAccountIdForCleanup;
    emailAccountIdForCleanup = undefined;
    try {
      await restoreActiveSnoozes(request, emailAccountId);
    } finally {
      await request.post(
        `/api/threads/${SIDE_PANEL_ARCHIVE_THREAD_ID}/unarchive`,
        { headers: { "X-Email-Account-ID": emailAccountId } },
      );
    }
  }
});

test("Command K archives the open side-panel conversation through the durable outbox", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  emailAccountIdForCleanup = emailAccountId;
  await stubMailboxSync(page, emailAccountId);
  await page.request.post(
    `/api/threads/${SIDE_PANEL_ARCHIVE_THREAD_ID}/unarchive`,
    { headers: { "X-Email-Account-ID": emailAccountId } },
  );

  await page.goto(
    `/${emailAccountId}/mail?side-panel-thread-id=${SIDE_PANEL_ARCHIVE_THREAD_ID}`,
  );
  const sidePanel = page
    .getByRole("dialog")
    .filter({ hasText: SIDE_PANEL_ARCHIVE_SUBJECT });
  await expect(sidePanel).toBeVisible({ timeout: 60_000 });
  const archivedConversation = page
    .locator('[role="listbox"][aria-label="Conversations"] [role="option"]')
    .filter({ hasText: SIDE_PANEL_ARCHIVE_SUBJECT });
  await expect(archivedConversation).toHaveCount(1, { timeout: 60_000 });
  await page.keyboard.press(`${commandModifier}+KeyK`);
  const archiveCommand = page.getByRole("option", {
    exact: true,
    name: "Archive E",
  });
  await expect(archiveCommand).toBeVisible();
  await archiveCommand.click();

  await expect(sidePanel).toBeHidden();
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "archive",
          threadId: SIDE_PANEL_ARCHIVE_THREAD_ID,
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ status: "succeeded" });
  await expect(archivedConversation).toHaveCount(0);
});

test("Command K acts on highlighted and selected conversations", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  emailAccountIdForCleanup = emailAccountId;

  await restoreActiveSnoozes(page.request, emailAccountId);

  await page.goto(`/${emailAccountId}/mail`);
  const conversations = page.getByRole("listbox", { name: "Conversations" });
  const options = conversations.getByRole("option");
  let initialConversationCount = 0;
  await expect
    .poll(
      async () => {
        const firstCount = await options.count();
        await page.waitForTimeout(250);
        const secondCount = await options.count();
        await page.waitForTimeout(250);
        const thirdCount = await options.count();
        initialConversationCount =
          firstCount === secondCount && secondCount === thirdCount
            ? thirdCount
            : 0;
        return initialConversationCount;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThanOrEqual(3);
  await ensureReadState(page, conversations, "Alice Example", false);
  await ensureReadState(page, conversations, "Bob Example", true);

  await page.keyboard.press(`${commandModifier}+KeyK`);
  const palette = page.getByRole("dialog");
  await expect(palette).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Archive conversation E" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Mark as read" }),
  ).toBeVisible();
  await expect(palette.getByRole("option", { name: "Snooze H" })).toBeVisible();
  await expect(palette).not.toContainText("Applies to");
  await attachScreenshotForChangedTest(
    testInfo,
    palette,
    "Command palette for highlighted conversation",
  );

  await palette.getByRole("option", { name: "Snooze" }).click();
  await expect(
    palette.getByPlaceholder("When should it return? Try Friday at 3pm"),
  ).toBeFocused();
  await expect(
    palette.getByRole("option", { name: "In 3 hours" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Tomorrow morning" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Next week" }),
  ).toBeVisible();
  await expect(palette.getByText("Archive conversation")).toHaveCount(0);
  await attachScreenshotForChangedTest(
    testInfo,
    palette,
    "Snooze preset options",
  );

  const snoozeInput = palette.getByPlaceholder(
    "When should it return? Try Friday at 3pm",
  );
  await snoozeInput.fill("tomorrow at 3pm");
  const naturalLanguageOption = palette.getByRole("option", {
    name: /^Snooze until /,
  });
  await expect(naturalLanguageOption).toHaveCount(1);
  await expect(naturalLanguageOption).toBeVisible();
  await expect(naturalLanguageOption).toHaveAttribute("aria-selected", "true");
  await expect(palette.getByRole("option", { name: "In 3 hours" })).toHaveCount(
    0,
  );
  await attachScreenshotForChangedTest(
    testInfo,
    palette,
    "Natural-language snooze option",
  );

  await page.keyboard.press("Escape");
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("option", { name: "Snooze" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  await page.keyboard.press("KeyH");
  await expect(palette).toBeVisible();
  await expect(
    palette.getByPlaceholder("When should it return? Try Friday at 3pm"),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette.getByRole("option", { name: "Snooze H" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  await conversations
    .getByRole("checkbox", { name: "Select conversation from Alice Example" })
    .click();
  await conversations
    .getByRole("checkbox", { name: "Select conversation from Bob Example" })
    .click();

  await page.keyboard.press(`${commandModifier}+KeyK`);
  await expect(
    palette.getByRole("option", { name: "Archive 2 conversations E" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Mark 2 as read" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Mark 2 as unread" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Snooze 2 conversations" }),
  ).toBeVisible();

  await palette.getByRole("option", { name: "Mark 2 as read" }).click();
  await expect(palette).toBeHidden();
  await conversations
    .getByRole("checkbox", { name: "Select conversation from Alice Example" })
    .click();
  await conversations
    .getByRole("checkbox", { name: "Select conversation from Bob Example" })
    .click();
  await page.keyboard.press(`${commandModifier}+KeyK`);
  await expect(
    palette.getByRole("option", { name: "Mark 2 as unread" }),
  ).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Snooze 2 conversations" }),
  ).toBeVisible();
  await palette.getByRole("option", { name: "Snooze 2 conversations" }).click();
  await palette.getByRole("option", { name: "In 3 hours" }).click();
  await expect(options).toHaveCount(initialConversationCount - 2);
});

async function ensureReadState(
  page: Page,
  conversations: Locator,
  sender: string,
  read: boolean,
) {
  const checkbox = conversations.getByRole("checkbox", {
    name: `Select conversation from ${sender}`,
  });
  await checkbox.click();
  const selectionCount = page.getByText("1 selected", { exact: true });
  await expect(selectionCount).toBeVisible();
  await page.keyboard.press(`${commandModifier}+KeyK`);
  const palette = page.getByRole("dialog");
  const desiredAction = palette.getByRole("option", {
    name: read ? "Mark as read" : "Mark as unread",
  });
  const oppositeAction = palette.getByRole("option", {
    name: read ? "Mark as unread" : "Mark as read",
  });
  await expect(desiredAction.or(oppositeAction)).toBeVisible();

  if (await desiredAction.isVisible()) {
    await desiredAction.click();
    await expect(palette).toBeHidden();
    await expect(selectionCount).toBeHidden();
    return;
  }

  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(selectionCount).toBeHidden();
}

async function attachScreenshotForChangedTest(
  testInfo: TestInfo,
  locator: Locator,
  name: string,
) {
  const testFile = path
    .relative(process.cwd(), testInfo.file)
    .split(path.sep)
    .join("/");
  const changedTestFiles = new Set(
    (process.env.PLAYWRIGHT_CHANGED_TEST_FILES ?? "")
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean),
  );

  if (!changedTestFiles.has(testFile)) return;

  await capturePlaywrightCheckpoint(locator, testInfo, name);
}

function stubMailboxSync(page: Page, emailAccountId: string) {
  let seededArchiveMessage = false;
  return page.route("**/api/mobile/mailbox-sync", (route) => {
    const internalDate = new Date().toISOString();
    const upsertedMessages = seededArchiveMessage
      ? []
      : [
          {
            date: internalDate,
            headers: {
              date: internalDate,
              from: "Erin Example <erin@example.com>",
              subject: SIDE_PANEL_ARCHIVE_SUBJECT,
              to: "playwright-test@gmail.com",
            },
            historyId: "playwright-command-palette-history",
            id: SIDE_PANEL_ARCHIVE_MESSAGE_ID,
            inline: [],
            internalDate,
            labelIds: ["INBOX"],
            snippet:
              "This conversation is reserved for archive and undo coverage.",
            subject: SIDE_PANEL_ARCHIVE_SUBJECT,
            threadId: SIDE_PANEL_ARCHIVE_THREAD_ID,
          },
        ];
    seededArchiveMessage = true;
    return route.fulfill({
      body: JSON.stringify({
        accountId: emailAccountId,
        cursor: "playwright-command-palette-sync",
        deletedMessageIds: [],
        hasMore: false,
        reset: false,
        upsertedMessages,
      }),
      contentType: "application/json",
      status: 200,
    });
  });
}

async function restoreActiveSnoozes(
  request: APIRequestContext,
  emailAccountId: string,
) {
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!internalApiKey) {
    throw new Error("Playwright INTERNAL_API_KEY is not configured");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE "SnoozedThread"
       SET status = 'PENDING'
       WHERE "emailAccountId" = $1
         AND "threadId" = ANY($2)
         AND status = 'EXECUTING'`,
      [emailAccountId, SEEDED_THREAD_IDS],
    );
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "SnoozedThread"
       WHERE "emailAccountId" = $1
         AND "threadId" = ANY($2)
         AND status = 'PENDING'`,
      [emailAccountId, SEEDED_THREAD_IDS],
    );

    for (const { id } of result.rows) {
      const response = await request.post("/api/snoozed-threads/execute", {
        data: { snoozedThreadId: id },
        headers: {
          "x-api-key": internalApiKey,
        },
      });
      expect(response.ok()).toBeTruthy();
    }
  } finally {
    await client.end();
  }
}
