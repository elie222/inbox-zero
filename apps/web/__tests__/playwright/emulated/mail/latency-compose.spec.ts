import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import { measureInteraction, withCleanup } from "./latency-test-helpers";
import {
  clearWorkflowMailboxDrafts,
  openMail,
  withClient,
} from "./mail-test-helpers";
import { getEmailAccountId } from "../account-test-helpers";

const UNDO_TOAST = { name: "undoToast", kind: "undoToast", transient: true };

test.beforeEach(async ({ page }) => {
  await clearWorkflowMailboxDrafts(page);
});

test("sends a new email without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog
    .getByRole("combobox", { name: "To" })
    .fill("recipient@example.com");
  await dialog
    .getByPlaceholder("Subject")
    .fill(`Latency compose ${Date.now()}`);
  const body = `A new email sent at once. ${Date.now()}`;
  const editor = dialog.locator("[contenteditable='true']");
  await editor.pressSequentially(body);

  await measureInteraction({
    context,
    page,
    testInfo,
    interaction: "send-new-email",
    start: { click: "button" },
    probes: [
      { name: "composerClosed", kind: "composerGone", text: body },
      {
        name: "sentToast",
        kind: "element",
        selector: '[aria-label^="Notifications"] li',
        text: "Email sent!",
      },
      UNDO_TOAST as never,
    ],
    act: async () => {
      await sendWhileDraftSaves(page, editor);
      await dialog.getByRole("button", { exact: true, name: "Send" }).click();
    },
  });
});

test("forwards a message without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const sourceMessage = await openReplyConversation(page);
  await sourceMessage
    .getByRole("button", { name: "Forward", exact: true })
    .click();
  await sourceMessage
    .getByRole("combobox", { name: "To" })
    .fill(`forward-${Date.now()}@example.com`);
  const editor = sourceMessage.getByRole("textbox", { name: "Email message" });
  const body = `A forward sent at once. ${Date.now()}`;
  await editor.pressSequentially(body);

  await measureInteraction({
    context,
    page,
    testInfo,
    interaction: "send-forward",
    start: { click: "button" },
    probes: [
      { name: "composerClosed", kind: "composerGone", text: body },
      { name: "forwardInThread", kind: "sentReply", text: body },
      UNDO_TOAST as never,
    ],
    act: async () => {
      await sendWhileDraftSaves(page, editor);
      await sourceMessage
        .getByRole("button", { name: "Send", exact: true })
        .click();
    },
  });
});

test("schedules a reply without waiting on the network", async ({
  context,
  page,
}, testInfo) => {
  const sourceMessage = await openReplyConversation(page);
  const emailAccountId = await getEmailAccountId(page);
  await withCleanup(
    async () => {
      await sourceMessage
        .getByRole("button", { name: "Reply", exact: true })
        .click();
      const editor = sourceMessage.getByRole("textbox", {
        name: "Email message",
      });
      const body = `A reply scheduled at once. ${Date.now()}`;
      await editor.pressSequentially(body);
      await page
        .getByRole("button", { name: "Send later", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Send later" })
        .getByRole("button", { name: /Tomorrow morning/ })
        .click();

      await measureInteraction({
        context,
        page,
        testInfo,
        interaction: "schedule-reply",
        start: { click: "button" },
        probes: [
          { name: "composerClosed", kind: "composerGone", text: body },
          {
            name: "scheduledStatus",
            kind: "element",
            selector: '[aria-label="Reply delivery status"]',
            // "Scheduling for" at once, "Scheduled for" once confirmed.
            text: "Schedul",
          },
        ],
        act: () =>
          sourceMessage
            .getByRole("button", { name: "Send", exact: true })
            .click(),
      });
    },
    async () => {
      await withClient((client) =>
        client.query(
          'DELETE FROM "ScheduledEmail" WHERE "emailAccountId" = $1 AND "threadId" = $2',
          [emailAccountId, "thr_playwright_reply"],
        ),
      );
    },
  );
});

async function openReplyConversation(page: Page) {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const sourceMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });
  return sourceMessage;
}

/**
 * Finishes typing so a mailbox draft save is on its way when Send is pressed,
 * which is when a send used to wait.
 */
async function sendWhileDraftSaves(
  page: Page,
  editor: ReturnType<Page["locator"]>,
) {
  // Required: without a save in flight the test would not cover the case.
  const draftSave = page.waitForRequest(
    (request) =>
      request.method() === "POST" && Boolean(request.headers()["next-action"]),
    { timeout: 10_000 },
  );
  await editor.pressSequentially(".");
  await draftSave;
}
