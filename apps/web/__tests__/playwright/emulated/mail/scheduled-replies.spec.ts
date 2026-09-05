import { expect, type Page } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail, withClient } from "./mail-test-helpers";

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
    await sendDialog.getByRole("button", { name: /Tomorrow morning/ }).click();
    await page.getByRole("button", { name: "Remind me", exact: true }).click();
    const reminderDialog = page.getByRole("dialog", { name: "Remind me" });
    await expect(reminderDialog).toContainText("if no one replies");
    await capturePlaywrightCheckpoint(page, testInfo, "17-reminder-menu");
    await reminderDialog
      .getByRole("button", { name: /2 days after sending/ })
      .click();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(delivery.getByText(/^Scheduled for/)).toBeVisible();
    await expect(delivery.getByText(/Remind me .* if no reply/)).toBeVisible();
    await page.reload();
    await expect(delivery.getByText(/^Scheduled for/)).toBeVisible();
    await expect(delivery.getByText(/Remind me .* if no reply/)).toBeVisible();
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
      delivery.getByText("Reply needs attention", { exact: true }),
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
      delivery.getByText("Delivery uncertain", { exact: true }),
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

async function openReply(page: Page) {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=${THREAD_ID}`);
  await expect(
    page.getByText("Please reply to this seeded conversation."),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Thread actions" })
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Email message" })
    .fill("Thanks Leslie, Thursday works. I will bring the updated proposal.");
  return emailAccountId;
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

test("sends a reply with a reminder through the local email provider", async ({
  page,
}, testInfo) => {
  const emailAccountId = await openReply(page);
  const message = "Confirmed for Thursday. Please bring the updated proposal.";
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
    const body = await response.json();
    expect(
      body.thread.messages.some(
        (item: { textPlain?: string; textHtml?: string }) =>
          `${item.textPlain ?? ""}${item.textHtml ?? ""}`.includes(message),
      ),
    ).toBe(true);
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
