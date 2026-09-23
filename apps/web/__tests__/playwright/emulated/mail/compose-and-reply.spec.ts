import { expect } from "@playwright/test";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import {
  conversationWithSubject,
  expectThreadReaderBody,
  openMail,
  openMailboxFromSidebar,
  readLatestMailMutation,
  waitForComposeOutboxSend,
} from "./mail-test-helpers";

test("composes, sends, and reads a new message from Sent", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const subject = `Playwright Composed Message ${testInfo.retry}`;

  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog
    .getByRole("combobox", { name: "To" })
    .fill("recipient@example.com");
  await dialog.getByPlaceholder("Subject").fill(subject);
  const composeEditor = dialog.locator("[contenteditable='true']");
  await composeEditor.pressSequentially("A composed message body.");
  await expect(composeEditor).toContainText("A composed message body.");
  await dialog.getByRole("button", { name: "Show signature" }).click();
  await expect(
    dialog
      .locator("[data-email-preserved-kind='signature']")
      .getByRole("link", { name: "Inbox Zero" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "composer-with-footer");
  await dialog.getByRole("button", { exact: true, name: "Send" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Email sent!", { exact: true })).toBeVisible();

  await openMailboxFromSidebar(page, "Sent");
  await waitForComposeOutboxSend(page, emailAccountId);
  const sentConversation = conversationWithSubject(
    page,
    conversations,
    subject,
  );
  await expect(sentConversation).toBeVisible({ timeout: 60_000 });
  await sentConversation.click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  await expect(page.getByText("recipient@example.com").first()).toBeVisible();
  await expectThreadReaderBody(page, "A composed message body.");
  await expectThreadReaderBody(page, "Sent with Inbox Zero");
  await capturePlaywrightCheckpoint(page, testInfo, "composed-message-in-sent");
});

test("undoes a composed message before it is delivered", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const subject = `Playwright Undo Send ${Date.now()}`;

  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog
    .getByRole("combobox", { name: "To" })
    .fill("recipient@example.com");
  await dialog.getByPlaceholder("Subject").fill(subject);
  await dialog
    .locator("[contenteditable='true']")
    .pressSequentially("This should not be delivered.");
  await dialog.getByRole("button", { exact: true, name: "Send" }).click();

  await expect(dialog).toBeHidden();
  const notifications = page.getByRole("region", {
    name: "Notifications alt+T",
  });
  await expect(
    notifications.getByText("Email sent!", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "compose:new-message",
      }),
    )
    .toMatchObject({ status: "reconciling" });
  await notifications.getByRole("button", { name: /^Undo/ }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("Subject")).toHaveValue(subject);
  await expect(
    dialog.getByRole("textbox", { name: "Email message" }),
  ).toContainText("This should not be delivered.");
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "compose:new-message",
      }),
    )
    .toBeUndefined();
  await capturePlaywrightCheckpoint(page, testInfo, "compose-undo-restored");

  await openMailboxFromSidebar(page, "Sent");
  await expect(
    conversationWithSubject(page, conversations, subject),
  ).toHaveCount(0);
});

test("selects the sender when composing from all accounts", async ({
  page,
}) => {
  const { emailAccountId } = await openMail(page);
  const signature = "Secondary account signature";
  const secondAccount = await createSecondEmailAccount(emailAccountId, {
    signature,
  });

  try {
    await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    await page.getByRole("button", { name: /^Compose/ }).click();

    const dialog = page.getByRole("dialog", { name: "New Message" });
    const from = dialog.getByRole("combobox", { name: "From" });
    await expect(from).toBeVisible();
    await from.click();
    await expect(page.getByRole("option")).toHaveCount(2);
    await page
      .getByRole("option", {
        name: `${secondAccount.name} (${secondAccount.email})`,
        exact: true,
      })
      .click();

    await expect(from).toContainText(secondAccount.email);
    await dialog.getByRole("button", { name: "Show signature" }).click();
    await expect(
      dialog
        .locator("[data-email-preserved-kind='signature']")
        .getByText(signature),
    ).toBeVisible();
  } finally {
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});

test("leaves the draft before returning to the list with Escape", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Reply Workflow Message",
  ).click();
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await message.getByRole("button", { name: "Reply", exact: true }).click();
  const editor = message.getByRole("textbox", { name: "Email message" });
  await editor.fill("A draft preserved when leaving the input.");
  // The reply tooltip owns Escape until its exit animation finishes.
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const threadUrl = page.url();

  await editor.press("Escape");
  await expect(message).toBeFocused();
  await expect(page).toHaveURL(threadUrl);
  await expect(editor).toContainText(
    "A draft preserved when leaving the input.",
  );
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "draft-escape-focuses-message",
  );

  await page.keyboard.press("Escape");
  await expect(conversations).toBeVisible();
  await expect(message).toBeHidden();
});

test("returns focus from a draft in a single-message email panel", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.route("**/api/user/no-reply", async (route) => {
    const response = await route.fetch({
      url: new URL(
        "/api/threads/thr_playwright_reply?includeDrafts=true",
        route.request().url(),
      ).toString(),
    });
    const { thread }: ThreadResponse = await response.json();
    await route.fulfill({ json: [thread] });
  });
  await page.goto(`/${emailAccountId}/no-reply?thread-id=thr_playwright_reply`);
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(message).toBeVisible();
  await expect(message).not.toHaveAttribute("data-selected");
  await message.getByRole("button", { name: "Reply", exact: true }).click();
  const editor = message.getByRole("textbox", { name: "Email message" });
  await editor.fill("A draft in the email panel.");
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await editor.press("Escape");

  await expect(message).toBeFocused();
  await expect(editor).toContainText("A draft in the email panel.");
  await capturePlaywrightCheckpoint(page, testInfo, "panel-draft-escape-focus");
});

test("focuses the To field when forwarding with F", async ({ page }) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Reply Workflow Message",
  ).click();
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(message).toBeVisible();
  await expect(
    message.getByRole("button", { name: "Forward", exact: true }),
  ).toBeVisible();

  await page.keyboard.press("KeyF");

  const toField = message.getByRole("combobox", { name: "To" });
  await expect(toField).toBeVisible();
  await expect(toField).toBeFocused();
  await expect(
    message.getByRole("textbox", { name: "Email message" }),
  ).not.toBeFocused();
});

test("opens and sends a reply from the reader with Enter", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const replyConversation = conversationWithSubject(
    page,
    conversations,
    "Reply Workflow Message",
  );
  await replyConversation.click();
  const sourceMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Enter");

  await expectThreadReaderBody(
    page,
    "Please reply to this seeded conversation.",
  );
  const sentByMe = page.getByText("Me", { exact: true });
  const initialSentByMeCount = await sentByMe.count();

  const replyEditor = page.locator("[contenteditable='true']");
  await expect(replyEditor).toBeVisible();
  await expect(replyEditor).toHaveCount(1);
  await expect(
    page.locator("[data-email-preserved-kind='quote']"),
  ).toBeAttached();
  await expect(
    page.getByLabel(/^Show (signature and )?quoted message$/),
  ).toBeVisible();
  await expect(page.getByText("Quoted message", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Remove quoted message" }),
  ).toHaveCount(0);
  const replyBody = `A reply sent through the mail reader. ${testInfo.retry}`;
  await replyEditor.pressSequentially(replyBody);
  await expect(replyEditor).toContainText(replyBody);
  await capturePlaywrightCheckpoint(page, testInfo, "inline-reply-divider");
  const sendButton = page.getByRole("button", { name: "Send", exact: true });
  await expect(sendButton).toHaveText("Send");

  await replyEditor.press("ControlOrMeta+Shift+l");
  await expect(page.getByRole("dialog", { name: "Send later" })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "send-later-shortcut");

  await page.getByRole("button", { name: "Choose date and time" }).click();
  await page
    .getByLabel("Send later date and time")
    .press("ControlOrMeta+Shift+h");
  await expect(page.getByRole("dialog", { name: "Remind me" })).toBeVisible();
  await page.keyboard.press("Escape");

  await replyEditor.press("ControlOrMeta+Shift+l");
  await expect(page.getByRole("dialog", { name: "Send later" })).toBeVisible();
  await expect(page.getByLabel("Send later date and time")).toBeHidden();
  await page.keyboard.press("Escape");

  await sendButton.hover();
  const sendTooltip = page.getByRole("tooltip", { name: /Send and mark done/ });
  await expect(sendTooltip).toContainText("Send and mark done");
  await expect(sendTooltip.locator("kbd")).toHaveText([
    "⌘",
    "enter",
    "⌘",
    "shift",
    "enter",
  ]);
  await capturePlaywrightCheckpoint(page, testInfo, "protected-quoted-reply");
  await sendButton.click();

  const notifications = page.getByRole("region", {
    name: "Notifications alt+T",
  });
  await expect(
    notifications.getByText("Email sent!", { exact: true }),
  ).toBeVisible();
  await expect(
    notifications.getByRole("button", { name: /^Undo/ }),
  ).toBeVisible();
  await expect(replyEditor).toHaveCount(0);
  await expectThreadReaderBody(page, replyBody);
  const delivery = page.getByRole("region", { name: "Reply delivery status" });
  await expect(delivery.getByText("Sending…", { exact: true })).toHaveCount(0);
  await expect(delivery.getByText("Reply sent", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    delivery.getByRole("button", { name: "Edit reply" }),
  ).toHaveCount(0);
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: "thr_playwright_reply",
        }),
      { timeout: 20_000 },
    )
    .toMatchObject({ status: "succeeded" });
  await expect(sentByMe).toHaveCount(initialSentByMeCount + 1);
  await capturePlaywrightCheckpoint(page, testInfo, "reply-sent-in-thread");
});

test("focuses the To field when forwarding", async ({ page }) => {
  const { emailAccountId } = await openMail(page);
  // Open by thread id so this still works after an earlier reply-and-mark-done
  // removes the conversation from the inbox list.
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(message).toBeVisible({ timeout: 60_000 });

  await message.getByRole("button", { name: "Forward", exact: true }).click();
  const toField = message.getByRole("combobox", { name: "To" });
  await expect(toField).toBeVisible();
  await expect(toField).toBeFocused();
  await expect(
    message.getByRole("textbox", { name: "Email message" }),
  ).not.toBeFocused();
});

test("keeps a sent forward in the thread it came from", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const sourceMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });
  const sentByMe = page.getByText("Me", { exact: true });
  const initialSentByMeCount = await sentByMe.count();

  await sourceMessage
    .getByRole("button", { name: "Forward", exact: true })
    .click();
  await sourceMessage
    .getByRole("combobox", { name: "To" })
    .fill("recipient@example.com");
  const editor = sourceMessage.getByRole("textbox", {
    name: "Email message",
  });
  const forwardBody = `A forwarded message sent through the mail reader. ${testInfo.retry}`;
  await editor.pressSequentially(forwardBody);
  await sourceMessage
    .getByRole("button", { name: "Send", exact: true })
    .click();

  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: "thr_playwright_reply",
        }),
      { timeout: 20_000 },
    )
    .toMatchObject({ status: "succeeded" });
  await expect(page).toHaveURL(/thread-id=thr_playwright_reply/);
  await expect(sourceMessage).toBeVisible();
  await expect(sentByMe).toHaveCount(initialSentByMeCount + 1);
  await expect(
    page
      .getByRole("region", { name: "Reply delivery status" })
      .getByText("Reply sent", { exact: true }),
  ).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "forward-sent-in-thread");
});

test("shows the files a forward carries", async ({ page }, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Re: Reader Visual Message",
  ).click();
  const sourceMessage = page
    .locator("[data-thread-message-id]")
    .filter({ hasText: "reader-preview.png" })
    .last();
  await expect(sourceMessage).toBeVisible({ timeout: 60_000 });

  await sourceMessage
    .getByRole("button", { name: "Forward", exact: true })
    .click();

  // The provider holds the bytes until the send, so the composer lists them
  // without ever downloading them.
  await expect(
    page
      .getByRole("list", { name: "Attachments" })
      .getByText("reader-preview.png"),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "forward-attachments");
});

test("keeps reply and forward drafts in separate composer sessions", async ({
  page,
}) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(message).toBeVisible();

  await message.getByRole("button", { name: "Reply", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Email message" });
  await editor.fill("Reply-only draft text");

  await message.getByRole("button", { name: "Forward", exact: true }).click();
  await expect(editor).not.toContainText("Reply-only draft text");
  await expect(message.getByRole("combobox", { name: "To" })).toHaveValue("");
  await expect(message.getByRole("button", { name: /^Remove / })).toHaveCount(
    0,
  );
  await editor.fill("Forward-only draft text");

  await message.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(editor).toContainText("Reply-only draft text");
  await page.getByRole("button", { name: /^Draft to Leslie/ }).click();
  await expect(
    message.getByRole("button", { name: /^Remove .*leslie@example\.com/i }),
  ).toBeVisible();

  await message.getByRole("button", { name: "Forward", exact: true }).click();
  await expect(editor).toContainText("Forward-only draft text");
  await expect(message.getByRole("combobox", { name: "To" })).toHaveValue("");
  await expect(message.getByRole("button", { name: /^Remove / })).toHaveCount(
    0,
  );
});
