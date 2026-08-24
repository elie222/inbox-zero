import { expect, test, type Locator } from "@playwright/test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("keeps editing state stable across formatting, links, paste, and files", async ({
  page,
}, testInfo) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const editor = dialog.locator("[contenteditable='true']");
  const formatting = dialog.getByRole("toolbar", {
    name: "Email formatting",
  });

  await expect(editor).toHaveCount(1);
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

  await editor.click();
  await formatting.getByRole("button", { name: "Right-to-left text" }).click();
  await expect(editor.locator("p[dir='rtl']")).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("composer-foundation.png"),
  });
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
});

test("replies inside an existing conversation", async ({ page }, testInfo) => {
  const { conversations } = await openMail(page);
  const replyConversation = conversationWithSubject(
    page,
    conversations,
    "Reply Workflow Message",
  );
  await replyConversation.click();
  await expect(
    page.getByText("Please reply to this seeded conversation."),
  ).toBeVisible();
  const sentByMe = page.getByText("Me", { exact: true });
  const initialSentByMeCount = await sentByMe.count();

  await page.getByRole("button", { name: /^Reply R$/ }).click();
  const replyEditor = page.locator("[contenteditable='true']");
  await expect(replyEditor).toBeVisible();
  await expect(replyEditor).toHaveCount(1);
  await expect(
    page.locator("[data-email-preserved-kind='quote']"),
  ).toBeVisible();
  const replyBody = `A reply sent through the mail reader. ${testInfo.retry}`;
  await replyEditor.pressSequentially(replyBody);
  await expect(replyEditor).toContainText(replyBody);
  await page.getByRole("button", { name: /^Send/ }).click();

  await expect(page.getByText("Email sent!", { exact: true })).toBeVisible();
  await expect(sentByMe).toHaveCount(initialSentByMeCount + 1);
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
