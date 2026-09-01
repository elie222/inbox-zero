import { expect, type Locator } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("keeps keyboard focus in the composer and follows the message field order", async ({
  page,
}) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const toField = dialog.getByRole("textbox", { name: "To" });
  await expect(toField).toBeFocused();

  const showCcBccButton = dialog.getByRole("button", { name: "Cc/Bcc" });
  await showCcBccButton.focus();
  await showCcBccButton.press("Enter");
  await expect(
    dialog.getByRole("button", { name: "Hide Cc/Bcc" }),
  ).toBeFocused();

  await toField.focus();

  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Hide Cc/Bcc" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(toField).toBeFocused();

  for (const field of [
    dialog.getByRole("textbox", { exact: true, name: "Cc" }),
    dialog.getByRole("textbox", { exact: true, name: "Bcc" }),
    dialog.getByPlaceholder("Subject"),
    dialog.getByRole("textbox", { name: "Email message" }),
    dialog.getByRole("button", { name: /^Send/ }),
    dialog.getByRole("button", { name: "Attach files" }),
    dialog.getByRole("button", { name: "Insert inline images" }),
    dialog.getByRole("button", { name: "Discard draft" }),
  ]) {
    await page.keyboard.press("Tab");
    await expect(field).toBeFocused();
  }

  // Focus wraps from the dialog's last control back to its first instead of
  // escaping the non-modal composer.
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Expand compose" }),
  ).toBeFocused();
});

test("focuses the message field from the empty composer body", async ({
  page,
}) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const editorRoot = dialog.locator("[data-email-editor-root]");
  const editor = editorRoot.locator("[contenteditable='true']");
  await expect(editor).toBeVisible();
  await dialog.getByPlaceholder("Subject").focus();
  await expect(editor).not.toBeFocused();

  // The empty composer's content is a single paragraph at the top, so the
  // root's center point lands in the empty body area below it.
  await editorRoot.click();

  await expect(editor).toBeFocused();
});

test("keeps editing state stable across formatting, links, paste, and files", async ({
  page,
}, testInfo) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const editor = dialog.locator("[contenteditable='true']");
  const formatting = page.getByRole("toolbar", {
    name: "Selection formatting",
  });

  await expect(dialog).toBeVisible();
  await expect(editor).toBeVisible();
  await expect(
    dialog.getByRole("toolbar", { name: "Email formatting" }),
  ).toHaveCount(0);
  await expect(dialog).toHaveAttribute("data-compose-expanded", "false");
  await expect(
    dialog.getByRole("button", { name: "Expand compose" }),
  ).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "To" })
    .fill("teammate@example.com");
  await dialog.getByPlaceholder("Subject").fill("Project update");
  await editor.pressSequentially("Alpha omega");
  for (const _character of "omega") {
    await editor.press("ArrowLeft");
  }

  await dialog.getByTestId("compose-attachments-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Attachment contents"),
  });
  await expect(dialog.getByRole("list", { name: "Attachments" })).toContainText(
    "notes.txt",
  );
  await editor.pressSequentially("middle ");
  await expect(editor).toContainText("Alpha middle omega");

  await editor.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/html", "<div>Pasted <strong>rich</strong></div>");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    );
  });
  await expect(editor.locator("strong", { hasText: "rich" })).toBeVisible();

  await selectEditorText(editor, "middle");
  await formatting.getByRole("button", { name: "Bold" }).click();
  await expect(editor.locator("strong", { hasText: "middle" })).toBeVisible();

  await selectEditorText(editor, "omega");
  await editor.press("ControlOrMeta+k");
  const addLinkDialog = dialog.getByRole("dialog", { name: "Add link" });
  await addLinkDialog.getByLabel("Link address").fill("example.com/first");
  await addLinkDialog.getByRole("button", { name: "Add" }).click();
  const link = editor.getByRole("link", { name: "omega" });
  await expect(link).toHaveAttribute("href", "https://example.com/first");

  await selectEditorText(editor, "omega");
  await formatting.getByRole("button", { name: "Add or edit link" }).click();
  const editLinkDialog = dialog.getByRole("dialog", { name: "Edit link" });
  await editLinkDialog
    .getByLabel("Link address")
    .fill("https://example.com/updated");
  await editLinkDialog.getByRole("button", { name: "Update" }).click();
  await expect(link).toHaveAttribute("href", "https://example.com/updated");

  await selectEditorText(editor, "omega");
  await formatting.getByRole("button", { name: "Add or edit link" }).click();
  await dialog
    .getByRole("dialog", { name: "Edit link" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(editor.getByRole("link", { name: "omega" })).toHaveCount(0);

  await selectEditorText(editor, "omega");
  await editor.press("ControlOrMeta+k");
  const cancelLink = dialog
    .getByRole("dialog", { name: "Add link" })
    .getByRole("button", { name: "Cancel" });
  await cancelLink.focus();
  await cancelLink.press("Escape");
  await expect(dialog.getByRole("dialog", { name: "Add link" })).toHaveCount(0);
  await expect(editor).toBeFocused();

  await dialog.getByTestId("compose-inline-image-input").setInputFiles({
    name: "inline.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(editor.locator("img[data-content-id]")).toHaveCount(1);
  await expect(dialog.getByRole("list", { name: "Attachments" })).toContainText(
    "inline.png",
  );

  await selectEditorText(editor, "middle");
  await formatting.getByRole("button", { name: "Right-to-left text" }).click();
  await expect(editor.locator("p[dir='rtl']")).toHaveCount(1);
  await formatting.getByRole("button", { name: "Left-to-right text" }).click();
  await expect(editor.locator("p[dir='ltr']")).toHaveCount(1);
  await selectEditorText(editor, "middle");
  await expect(
    page.getByRole("toolbar", { name: "Selection formatting" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "composer-selection");

  await editor.press("ArrowRight");
  await expect(formatting).toBeHidden();
  await capturePlaywrightCheckpoint(page, testInfo, "composer-compact");

  await dialog.getByRole("button", { name: "Expand compose" }).click();
  await expect(dialog).toHaveAttribute("data-compose-expanded", "true");
  await expect(
    dialog.getByRole("button", { name: "Restore compose" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "composer-expanded");

  await dialog.getByRole("button", { name: "Restore compose" }).click();
  await expect(dialog).toHaveAttribute("data-compose-expanded", "false");
});

test("does not add a line break for the send shortcut", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const subject = `Shortcut Message ${testInfo.retry}`;
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const editor = dialog.locator("[contenteditable='true']");
  await dialog
    .getByRole("textbox", { name: "To" })
    .fill("recipient@example.com");
  await dialog.getByPlaceholder("Subject").fill(subject);
  await editor.pressSequentially("Draft body");

  await editor.press("ControlOrMeta+Enter");

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Email sent!", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Sent/ }).click();
  const sentConversation = conversationWithSubject(
    page,
    conversations,
    subject,
  );
  await sentConversation.click();
  const sentBody = page
    .frameLocator('iframe[title="Email content preview"]')
    .locator("body");
  await expect(sentBody).toHaveText("Draft body");
  expect(await sentBody.evaluate((element) => element.innerText)).toBe(
    "Draft body",
  );
});

test("composes, sends, and reads a new message from Sent", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const subject = `Playwright Composed Message ${testInfo.retry}`;

  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog
    .getByRole("textbox", { name: "To" })
    .fill("recipient@example.com");
  await dialog.getByPlaceholder("Subject").fill(subject);
  const composeEditor = dialog.locator("[contenteditable='true']");
  await composeEditor.pressSequentially("A composed message body.");
  await expect(composeEditor).toContainText("A composed message body.");
  await dialog.getByRole("button", { name: /^Send/ }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Email sent!", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /^Sent/ }).click();
  const sentConversation = conversationWithSubject(
    page,
    conversations,
    subject,
  );
  await expect(sentConversation).toBeVisible();
  await sentConversation.click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  await expect(page.getByText("recipient@example.com").first()).toBeVisible();
  await expect(
    page
      .frameLocator('iframe[title="Email content preview"]')
      .getByText("A composed message body."),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "composed-message-in-sent");
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
    await expect(
      dialog
        .frameLocator('iframe[title="Signature preview"]')
        .getByText(signature),
    ).toBeVisible();
  } finally {
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});

test("opens and sends a reply from the reader with Enter", async ({
  page,
}, testInfo) => {
  const releaseThreadRequest = Promise.withResolvers<void>();
  let threadRequestStarted = false;
  await page.route(
    "**/api/threads/thr_playwright_reply?includeDrafts=true",
    async (route) => {
      threadRequestStarted = true;
      const responsePromise = route.fetch();
      await releaseThreadRequest.promise;
      const response = await responsePromise;
      await route.fulfill({ response });
    },
  );
  const { conversations } = await openMail(page);
  const replyConversation = conversationWithSubject(
    page,
    conversations,
    "Reply Workflow Message",
  );
  await replyConversation.click();
  await expect.poll(() => threadRequestStarted).toBe(true);
  await page.keyboard.press("Enter");
  releaseThreadRequest.resolve();

  await expect(
    page.getByText("Please reply to this seeded conversation."),
  ).toBeVisible();
  const sentByMe = page.getByText("Me", { exact: true });
  const initialSentByMeCount = await sentByMe.count();

  const replyEditor = page.locator("[contenteditable='true']");
  await expect(replyEditor).toBeVisible();
  await expect(replyEditor).toHaveCount(1);
  await expect(
    page.locator("[data-email-preserved-kind='quote']"),
  ).toBeVisible();
  const replyBody = `A reply sent through the mail reader. ${testInfo.retry}`;
  await replyEditor.pressSequentially(replyBody);
  await expect(replyEditor).toContainText(replyBody);
  await capturePlaywrightCheckpoint(page, testInfo, "protected-quoted-reply");
  await page.getByRole("button", { name: /^Send/ }).click();

  await expect(page.getByText("Email sent!", { exact: true })).toBeVisible();
  await expect(sentByMe).toHaveCount(initialSentByMeCount + 1);
  await capturePlaywrightCheckpoint(page, testInfo, "reply-sent-in-thread");
});

async function selectEditorText(editor: Locator, text: string) {
  await editor.evaluate((element, selectedText) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const start = node.textContent?.indexOf(selectedText) ?? -1;
      if (start >= 0) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + selectedText.length);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
        return;
      }
      node = walker.nextNode();
    }
    throw new Error(`Could not find text to select: ${selectedText}`);
  }, text);
}
