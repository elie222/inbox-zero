import { expect, type Page } from "@playwright/test";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import type { ThreadsResponse } from "@/app/api/threads/route";
import {
  conversationWithSubject,
  openMail,
  openMailboxFromSidebar,
  withClient,
} from "./mail-test-helpers";

const THREAD_ID = "thr_playwright_reply";

test("schedules a reply with a reminder, persists it and cancels both", async ({
  page,
}, testInfo) => {
  const emailAccountId = await openReply(page);
  const delivery = page.getByRole("region", { name: "Reply delivery status" });
  try {
    await page.getByRole("button", { name: "Send later", exact: true }).click();
    const sendDialog = page.getByRole("dialog", { name: "Send later" });
    await expect(sendDialog).toBeVisible();
    await capturePlaywrightCheckpoint(page, testInfo, "16-send-later-menu");
    await sendDialog
      .getByRole("button", { name: "Choose date and time" })
      .click();
    await expect(
      sendDialog.getByLabel("Send later date and time"),
    ).toBeVisible();
    await sendDialog.getByRole("button", { name: "Back", exact: true }).click();
    await expect(sendDialog.getByLabel("Send later date and time")).toHaveCount(
      0,
    );
    await sendDialog.getByRole("button", { name: /Tomorrow morning/ }).click();
    await page.getByRole("button", { name: "Remind me", exact: true }).click();
    const reminderDialog = page.getByRole("dialog", { name: "Remind me" });
    await expect(reminderDialog).toContainText("if no reply");
    await capturePlaywrightCheckpoint(page, testInfo, "17-reminder-menu");
    await reminderDialog
      .getByRole("button", { name: /2 days after sending/ })
      .click();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(delivery.getByText(/^Scheduled for/)).toBeVisible();
    await expect(delivery.getByText(/^Reminder if no reply by/)).toBeVisible();
    await page.reload();
    await expect(delivery.getByText(/^Scheduled for/)).toBeVisible();
    await expect(delivery.getByText(/^Reminder if no reply by/)).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "18-scheduled-after-reload",
    );
    await delivery.getByRole("button", { name: "Cancel reminder" }).click();
    await expect(
      delivery.getByRole("button", { name: "Cancel reminder" }),
    ).toHaveCount(0);
    await expect(delivery.getByText(/^Scheduled for/)).toBeVisible();
    await delivery.getByRole("button", { name: "Cancel send" }).click();
    await expect(delivery.getByText(/^Scheduled for/)).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Reply Workflow Message" }),
    ).toBeVisible();
    await expect(delivery.getByText(/^Scheduled for/)).toHaveCount(0);
    await capturePlaywrightCheckpoint(page, testInfo, "19-scheduled-cancelled");
  } finally {
    await withClient((client) =>
      client.query(
        'DELETE FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND "threadId" = $2',
        [emailAccountId, THREAD_ID],
      ),
    );
  }
});

test("offers recovery for a failed scheduled reply and guards uncertain delivery", async ({
  page,
}, testInfo) => {
  const emailAccountId = await openReply(page);
  const delivery = page.getByRole("region", { name: "Reply delivery status" });
  try {
    await page.getByRole("button", { name: "Send later", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Send later" })
      .getByRole("button", { name: /Tomorrow morning/ })
      .click();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(delivery.getByText(/^Scheduled for/)).toBeVisible();
    await setScheduledStatus(
      emailAccountId,
      "FAILED",
      "The email provider rejected this reply before delivery.",
    );
    await page.reload();
    await expect(
      delivery.getByText("Reply could not be sent", { exact: true }),
    ).toBeVisible();
    await expect(
      delivery.getByRole("button", { name: "Retry send" }),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "20-failed-reply-recovery",
    );
    await delivery.getByRole("button", { name: "Retry send" }).click();
    await expect(delivery.getByText(/^Scheduled for/)).toBeVisible();
    await setScheduledStatus(
      emailAccountId,
      "UNCERTAIN",
      "The connection ended before delivery could be confirmed.",
    );
    await page.reload();
    await expect(
      delivery.getByText("Couldn't confirm delivery", { exact: true }),
    ).toBeVisible();
    await expect(
      delivery.getByRole("link", { name: "Check Sent" }),
    ).toHaveAttribute("href", `/${emailAccountId}/mail?type=sent`);
    await expect(
      delivery.getByRole("button", { name: "Retry send" }),
    ).toHaveCount(0);
    await expect(
      delivery.getByRole("button", { name: "Cancel send" }),
    ).toHaveCount(0);
    await capturePlaywrightCheckpoint(page, testInfo, "21-uncertain-delivery");
  } finally {
    await withClient((client) =>
      client.query(
        'DELETE FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND "threadId" = $2',
        [emailAccountId, THREAD_ID],
      ),
    );
  }
});

test("sends a reply with a reminder through the local email provider", async ({
  page,
}, testInfo) => {
  const emailAccountId = await openReply(page);
  const initialResponse = await page.request.get(
    `/api/threads/${THREAD_ID}?includeDrafts=true`,
    { headers: { "X-Email-Account-ID": emailAccountId } },
  );
  expect(initialResponse.ok()).toBe(true);
  const initialThread: ThreadResponse = await initialResponse.json();
  const initialSentIds = initialThread.thread.messages
    .filter((message) => message.labelIds?.includes("SENT"))
    .map((message) => message.id);
  const message = `Confirmed for Thursday. Please bring the updated proposal. Attempt ${testInfo.retry}.`;
  await page.getByRole("textbox", { name: "Email message" }).fill(message);
  try {
    await page.getByRole("button", { name: "Remind me", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Remind me" })
      .getByRole("button", { name: /Tomorrow morning/ })
      .click();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const delivery = page.getByRole("region", {
      name: "Reply delivery status",
    });
    await expect(delivery.getByText("Reply sent", { exact: true })).toBeVisible(
      { timeout: 60_000 },
    );
    await expect(
      delivery.getByRole("button", { name: "Cancel reminder" }),
    ).toBeVisible();
    const scheduled = await withClient((client) =>
      client.query(
        'SELECT status, "reminderStatus" FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND "threadId" = $2',
        [emailAccountId, THREAD_ID],
      ),
    );
    expect(scheduled.rows).toEqual([
      { status: "SENT", reminderStatus: "PENDING" },
    ]);
    const response = await page.request.get(
      `/api/threads/${THREAD_ID}?includeDrafts=true`,
      { headers: { "X-Email-Account-ID": emailAccountId } },
    );
    expect(response.ok()).toBe(true);
    const body: ThreadResponse = await response.json();
    const sentMessages = body.thread.messages.filter((item) =>
      item.labelIds?.includes("SENT"),
    );
    expect(sentMessages).toHaveLength(initialSentIds.length + 1);
    const appended = sentMessages.filter(
      (item) => !initialSentIds.includes(item.id),
    );
    expect(appended).toHaveLength(1);
    expect(
      `${appended[0].textPlain ?? ""}${appended[0].textHtml ?? ""}`,
    ).toContain(message);
    await expect(
      page
        .frameLocator('iframe[title="Email content preview"]')
        .last()
        .getByText(message, { exact: true }),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(page, testInfo, "23-sent-with-reminder");
  } finally {
    await withClient((client) =>
      client.query(
        'DELETE FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND "threadId" = $2',
        [emailAccountId, THREAD_ID],
      ),
    );
  }
});

test("schedules a reply with a file from its mailbox draft and hides that draft", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const emailAccountId = await openReply(page);
  const delivery = page.getByRole("region", { name: "Reply delivery status" });
  const editor = page.getByRole("textbox", { name: "Email message" });
  let providerDraftId: string | null = null;
  try {
    await page.getByTestId("compose-attachments-input").setInputFiles({
      name: "agenda.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Example agenda"),
    });
    const attachments = page.getByRole("list", { name: "Attachments" });
    await expect(attachments).toContainText("agenda.txt");
    await expect(attachments.locator("li[aria-busy]")).toHaveCount(0, {
      timeout: 90_000,
    });

    // Text written after the file is attached reaches the mailbox draft too.
    const edited = `Agenda attached for Thursday. Attempt ${testInfo.retry}.`;
    await editor.fill(edited);
    await expect
      .poll(
        async () =>
          (await readThreadDrafts(page, emailAccountId)).some((draft) =>
            `${draft.textHtml ?? ""}${draft.textPlain ?? ""}`.includes(edited),
          ),
        { timeout: 90_000 },
      )
      .toBe(true);

    // Reopening the mailbox draft brings back what was written.
    await page.reload();
    await expect(editor).toContainText(edited);

    await page.getByRole("button", { name: "Send later", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Send later" })
      .getByRole("button", { name: /Tomorrow morning/ })
      .click();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(delivery.getByText(/^Scheduled for/)).toBeVisible();

    const scheduled = await readScheduledReply(emailAccountId);
    expect(scheduled).toMatchObject({
      status: "PENDING",
      hasAttachmentBytes: false,
    });
    providerDraftId = scheduled?.providerDraftId ?? null;
    expect(providerDraftId).toBeTruthy();
    expect(scheduled?.draftMessageIds.length).toBeGreaterThan(0);

    // The send goes out from the mailbox draft, which stays in the thread
    // until then; the delivery status stands in for it.
    expect(
      (await readThreadDrafts(page, emailAccountId)).length,
    ).toBeGreaterThan(0);
    await page.reload();
    await expect(delivery.getByText(/^Scheduled for/)).toBeVisible();
    await expect(editor).toHaveCount(0);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "scheduled-reply-draft-hidden",
    );

    // Cancelling brings the draft back with its text, and reopening it again
    // (after autosave has had its chance to write) keeps that text.
    await delivery.getByRole("button", { name: "Cancel send" }).click();
    await expect(delivery.getByText(/^Scheduled for/)).toHaveCount(0);
    for (let reopen = 0; reopen < 2; reopen++) {
      await page.reload();
      await expect(editor).toContainText(edited);
    }
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "scheduled-reply-draft-restored",
    );
  } finally {
    providerDraftId =
      (await readScheduledReply(emailAccountId))?.providerDraftId ??
      providerDraftId;
    if (providerDraftId) {
      await page.request.delete(
        `/api/user/drafts/${encodeURIComponent(providerDraftId)}`,
        { headers: { "X-Email-Account-ID": emailAccountId } },
      );
    }
    await withClient((client) =>
      client.query(
        'DELETE FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND "threadId" = $2',
        [emailAccountId, THREAD_ID],
      ),
    );
  }
});

test("schedules a new message from the composer", async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(20_000);
  const { emailAccountId } = await openMail(page);
  const subject = `Playwright Scheduled Message ${testInfo.retry}`;
  try {
    await page.getByRole("button", { name: /^Compose/ }).click();
    const dialog = page.getByRole("dialog", { name: "New Message" });
    await dialog
      .getByRole("combobox", { name: "To" })
      .fill("recipient@example.com");
    await dialog.getByPlaceholder("Subject").fill(subject);
    await dialog
      .locator("[contenteditable='true']")
      .pressSequentially("A scheduled message body.");
    await dialog
      .getByRole("button", { name: "Send later", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Send later" })
      .getByRole("button", { name: /Tomorrow morning/ })
      .click();
    await dialog.getByRole("button", { name: "Send", exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(
      page.getByText("Email scheduled.", { exact: true }),
    ).toBeVisible();
    const scheduled = await withClient((client) =>
      client.query(
        `SELECT status, "threadId" FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND payload->'email'->>'subject' = $2`,
        [emailAccountId, subject],
      ),
    );
    expect(scheduled.rows).toEqual([{ status: "PENDING", threadId: null }]);
  } finally {
    await withClient((client) =>
      client.query(
        `DELETE FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND payload->'email'->>'subject' = $2`,
        [emailAccountId, subject],
      ),
    );
  }
});

test("hides a scheduled new message's mailbox draft from Drafts until it's cancelled", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(20_000);
  const { emailAccountId, conversations } = await openMail(page);
  const subject = `Playwright Scheduled Draft ${testInfo.retry}`;
  const draftInList = conversationWithSubject(page, conversations, subject);
  try {
    await openMailboxFromSidebar(page, "Drafts");
    await page.getByRole("button", { name: /^Compose/ }).click();
    const dialog = page.getByRole("dialog", { name: "New Message" });
    await dialog
      .getByRole("combobox", { name: "To", exact: true })
      .fill("recipient@example.com");
    await page.keyboard.press("Enter");
    await dialog.getByPlaceholder("Subject").fill(subject);
    await dialog
      .getByRole("textbox", { name: "Email message" })
      .fill("A scheduled message saved in the mailbox.");
    await expect
      .poll(() => readMailboxDrafts(page, emailAccountId, subject), {
        timeout: 60_000,
      })
      .toHaveLength(1);
    await expect(draftInList).toBeVisible({ timeout: 60_000 });

    await dialog
      .getByRole("button", { name: "Send later", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Send later" })
      .getByRole("button", { name: /Tomorrow morning/ })
      .click();
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText("Email scheduled.", { exact: true }),
    ).toBeVisible();

    const scheduled = await withClient((client) =>
      client.query<{ status: string; draftMessageIds: string[] }>(
        `SELECT status, "draftMessageIds" FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND payload->'email'->>'subject' = $2`,
        [emailAccountId, subject],
      ),
    );
    expect(scheduled.rows).toHaveLength(1);
    expect(scheduled.rows[0].status).toBe("PENDING");
    expect(scheduled.rows[0].draftMessageIds.length).toBeGreaterThan(0);

    // The send goes out from the mailbox draft, so it stays in the mailbox
    // but not in the Drafts list.
    expect(await readMailboxDrafts(page, emailAccountId, subject)).toHaveLength(
      1,
    );
    await expect(draftInList).toHaveCount(0);
    await page.reload();
    await expect(conversations).toBeVisible({ timeout: 60_000 });
    await expect(draftInList).toHaveCount(0);
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "scheduled-message-draft-hidden",
    );

    await page.goto(`/${emailAccountId}/mail?type=scheduled`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("list", { name: "Scheduled emails" })
      .getByRole("listitem")
      .filter({ hasText: subject })
      .getByRole("button", { name: "Cancel send" })
      .click();
    await expect(page.getByText(subject, { exact: true })).toHaveCount(0);
    await openMailboxFromSidebar(page, "Drafts");
    await expect(draftInList).toBeVisible({ timeout: 60_000 });
  } finally {
    const rows = await withClient((client) =>
      client.query<{ providerDraftId: string | null }>(
        `SELECT payload->'email'->>'providerDraftId' AS "providerDraftId" FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND payload->'email'->>'subject' = $2`,
        [emailAccountId, subject],
      ),
    );
    for (const { providerDraftId } of rows.rows) {
      if (!providerDraftId) continue;
      await page.request.delete(
        `/api/user/drafts/${encodeURIComponent(providerDraftId)}`,
        { headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId } },
      );
    }
    await withClient((client) =>
      client.query(
        `DELETE FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND payload->'email'->>'subject' = $2`,
        [emailAccountId, subject],
      ),
    );
  }
});

test("adds a newly scheduled message to the Scheduled view already on screen", async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(20_000);
  const { emailAccountId } = await openMail(page);
  const subject = `Playwright Scheduled View ${testInfo.retry}`;
  await page.goto(`/${emailAccountId}/mail?type=scheduled`, {
    waitUntil: "domcontentloaded",
  });
  // The list stops polling once nothing is pending, so a row can only appear
  // here if scheduling invalidates its cache.
  await expect(page.getByText(/Nothing scheduled/)).toBeVisible({
    timeout: 60_000,
  });

  try {
    await page.getByRole("button", { name: /^Compose/ }).click();
    const dialog = page.getByRole("dialog", { name: "New Message" });
    await dialog
      .getByRole("combobox", { name: "To" })
      .fill("recipient@example.com");
    await dialog.getByPlaceholder("Subject").fill(subject);
    await dialog
      .locator("[contenteditable='true']")
      .pressSequentially("A scheduled message body.");
    await dialog
      .getByRole("button", { name: "Send later", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Send later" })
      .getByRole("button", { name: /Tomorrow morning/ })
      .click();
    await dialog.getByRole("button", { name: "Send", exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText(subject, { exact: true })).toBeVisible();
  } finally {
    await withClient((client) =>
      client.query(
        `DELETE FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND payload->'email'->>'subject' = $2`,
        [emailAccountId, subject],
      ),
    );
  }
});

async function openReply(page: Page) {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=${THREAD_ID}`);
  await expect(
    page.getByRole("heading", { name: /Reply Workflow Message/ }),
  ).toBeVisible();
  await page
    .locator('li[data-thread-message-id="msg_playwright_reply"]')
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Email message" })
    .fill("Thanks Leslie, Thursday works. I will bring the updated proposal.");
  return emailAccountId;
}

async function readThreadDrafts(page: Page, emailAccountId: string) {
  const response = await page.request.get(
    `/api/threads/${THREAD_ID}?includeDrafts=true`,
    { headers: { "X-Email-Account-ID": emailAccountId } },
  );
  expect(response.ok()).toBe(true);
  const body: ThreadResponse = await response.json();
  return body.thread.messages.filter((message) =>
    message.labelIds?.includes("DRAFT"),
  );
}

async function readMailboxDrafts(
  page: Page,
  emailAccountId: string,
  subject: string,
) {
  const response = await page.request.get(
    new URL("/api/threads?type=draft", page.url()).toString(),
    { headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId } },
  );
  expect(response.ok()).toBe(true);
  const body: ThreadsResponse = await response.json();
  return body.threads
    .flatMap((thread) => thread.messages)
    .filter((message) => message.headers.subject === subject);
}

async function readScheduledReply(emailAccountId: string) {
  const result = await withClient((client) =>
    client.query<{
      status: string;
      providerDraftId: string | null;
      hasAttachmentBytes: boolean;
      draftMessageIds: string[];
    }>(
      `SELECT status,
         payload->'email'->>'providerDraftId' AS "providerDraftId",
         payload->'email' ? 'attachments' AS "hasAttachmentBytes",
         "draftMessageIds"
       FROM "ScheduledEmail"
       WHERE "emailAccountId" = $1 AND "threadId" = $2 AND status != 'CANCELLED'`,
      [emailAccountId, THREAD_ID],
    ),
  );
  return result.rows[0];
}

function setScheduledStatus(
  emailAccountId: string,
  status: "FAILED" | "UNCERTAIN",
  error: string,
) {
  return withClient((client) =>
    client.query(
      'UPDATE "ScheduledEmail" SET status = $1, error = $2 WHERE "emailAccountId" = $3 AND "threadId" = $4 AND status != \'CANCELLED\'',
      [status, error, emailAccountId, THREAD_ID],
    ),
  );
}
