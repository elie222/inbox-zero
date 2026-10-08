import { expect, type Locator } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  createSecondEmailAccount,
  deleteSecondEmailAccount,
} from "./account-test-helpers";
import {
  conversationWithSubject,
  openMail,
  openMailboxFromSidebar,
  waitForComposeOutboxSend,
} from "./mail-test-helpers";

test("keeps keyboard focus in the composer and follows the message field order", async ({
  page,
}) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const toField = dialog.getByRole("combobox", { name: "To" });
  await expect(toField).toBeFocused();

  for (const field of [
    dialog.getByRole("combobox", { exact: true, name: "Cc" }),
    dialog.getByRole("combobox", { exact: true, name: "Bcc" }),
    dialog.getByPlaceholder("Subject"),
    dialog.getByRole("textbox", { name: "Email message" }),
    dialog.getByRole("button", { name: "Show signature" }),
    dialog.getByRole("button", { exact: true, name: "Send" }),
    dialog.getByRole("button", { name: "Send later" }),
    dialog.getByRole("button", { name: "Remind me" }),
    dialog.getByRole("button", { name: "Insert snippet" }),
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

test("opens the snippet picker from slash in the composer", async ({
  page,
}, testInfo) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const editor = dialog.getByRole("textbox", { name: "Email message" });
  await editor.click();
  await page.keyboard.type("/");

  const picker = page.getByRole("listbox", { name: "Snippets" });
  await expect(picker).toBeVisible();
  await expect(
    page.getByRole("option", { name: /Turn into snippet/ }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "slash-snippet-picker");

  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(editor).toContainText("/");

  await page.keyboard.press("Backspace");
  await page.keyboard.type("/");
  await expect(picker).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Save snippet" }),
  ).toBeVisible();
  // Save snippet is a modal, so the composer is aria-hidden and no longer
  // matches getByRole("dialog", { name: "New Message" }).
  await expect(page.locator("[data-compose-expanded]")).toBeVisible();
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

test("keeps the collapsed signature when typing after clicking below it", async ({
  page,
}, testInfo) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const editorRoot = dialog.locator("[data-email-editor-root]");
  const editor = dialog.getByRole("textbox", { name: "Email message" });
  const toggle = dialog.getByRole("button", { name: "Show signature" });
  await expect(toggle).toBeVisible();
  await expect(editor.locator("[data-smartmail]")).toHaveCount(0);

  const toggleBox = await toggle.boundingBox();
  const rootBox = await editorRoot.boundingBox();
  if (!toggleBox || !rootBox) throw new Error("Composer has no bounding box");
  const emptySpaceTop = toggleBox.y + toggleBox.height;
  const emptySpaceHeight = rootBox.y + rootBox.height - emptySpaceTop;
  expect(emptySpaceHeight).toBeGreaterThan(8);
  await page.mouse.click(
    rootBox.x + rootBox.width / 2,
    emptySpaceTop + emptySpaceHeight / 2,
  );
  await page.keyboard.type("Draft body");

  await expect(editor).toHaveText("Draft body");
  await expect(toggle).toBeVisible();
  await toggle.click();
  const signature = editor.locator("[data-smartmail]");
  await expect(signature).toContainText("Inbox Zero");
  expect(
    await editor.evaluate((element) => {
      const signatureElement = element.querySelector("[data-smartmail]");
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.textContent?.includes("Draft body")) {
          return Boolean(
            signatureElement &&
              walker.currentNode.compareDocumentPosition(signatureElement) &
                Node.DOCUMENT_POSITION_FOLLOWING,
          );
        }
      }
      return false;
    }),
  ).toBe(true);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "composer-click-below-collapsed-signature",
  );
});

test("edits the signature and its links in place", async ({ page }) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const editor = dialog.getByRole("textbox", { name: "Email message" });
  await editor.pressSequentially("Draft body");
  await dialog.getByRole("button", { name: "Show signature" }).click();

  const signature = editor.locator("[data-smartmail]");
  const footerLink = signature.getByRole("link", { name: "Inbox Zero" });
  await selectEditorText(editor, "Inbox Zero");
  await editor.press("ControlOrMeta+k");
  const editLinkDialog = dialog.getByRole("dialog", { name: "Edit link" });
  await expect(editLinkDialog.getByLabel("Link address")).toHaveValue(/^http/);
  await editLinkDialog
    .getByLabel("Link address")
    .fill("https://example.com/signature");
  await editLinkDialog.getByRole("button", { name: "Update" }).click();
  await expect(footerLink).toHaveAttribute(
    "href",
    "https://example.com/signature",
  );

  await selectEditorText(editor, "Sent with");
  await page.keyboard.type("Written with");
  await expect(signature).toContainText("Written with Inbox Zero");
  await expect(editor.locator(":scope > div").first()).toHaveText("Draft body");
});

test("restores a new message draft after closing the composer", async ({
  page,
}, testInfo) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const toField = dialog.getByRole("combobox", { name: "To" });
  const subjectField = dialog.getByPlaceholder("Subject");
  const messageField = dialog.getByRole("textbox", { name: "Email message" });
  await toField.fill("recipient@example.com");
  await subjectField.fill("Preserved compose draft");
  await messageField.fill("Keep this message after closing.");

  await dialog.getByRole("button", { name: "Close compose" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /^Compose/ }).click();

  await expect(
    dialog.getByRole("button", { name: "Remove recipient@example.com" }),
  ).toBeVisible();
  await expect(subjectField).toHaveValue("Preserved compose draft");
  await expect(messageField).toContainText("Keep this message after closing.");
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "restored-new-message-draft",
  );

  await dialog.getByRole("button", { name: "Discard draft" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /^Compose/ }).click();
  await expect(toField).toHaveValue("");
  await expect(
    dialog.getByRole("button", { name: "Remove recipient@example.com" }),
  ).toHaveCount(0);
  await expect(subjectField).toHaveValue("");
  await expect(messageField).not.toContainText(
    "Keep this message after closing.",
  );
  await dialog.getByRole("button", { name: "Discard draft" }).click();
  await expect(dialog).toBeHidden();
});

test("links URLs while typing and pasting", async ({ page }, testInfo) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  const editor = dialog.getByRole("textbox", { name: "Email message" });
  await editor.pressSequentially("Visit example.com/docs");
  await expect(dialog.getByRole("listbox", { name: "Snippets" })).toHaveCount(
    0,
  );
  await editor.press("Space");
  const typedLink = editor.getByRole("link", { name: "example.com/docs" });
  await expect(typedLink).toHaveAttribute("href", /example\.com\/docs$/);
  await expect(typedLink).toHaveCSS("color", "rgb(37, 99, 235)");
  await editor.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "More at example.org/help.");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  });
  await expect(
    editor.getByRole("link", { name: "example.org/help" }),
  ).toHaveAttribute("href", /example\.org\/help$/);
  await capturePlaywrightCheckpoint(page, testInfo, "automatic-url-links");
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
    .getByRole("combobox", { name: "To" })
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
  await expect(editor.locator("b, strong", { hasText: "rich" })).toBeVisible();

  await selectEditorText(editor, "middle");
  await formatting.getByRole("button", { name: "Bold" }).click();
  await expect(
    editor.locator("b, strong", { hasText: "middle" }),
  ).toBeVisible();

  await selectEditorText(editor, "omega");
  await editor.press("ControlOrMeta+k");
  const addLinkDialog = dialog.getByRole("dialog", { name: "Add link" });
  await addLinkDialog.getByLabel("Link address").fill("example.com/first");
  await capturePlaywrightCheckpoint(page, testInfo, "composer-link-panel");
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
  await expect(editor.locator("[dir='rtl']")).toHaveCount(1);
  await formatting.getByRole("button", { name: "Left-to-right text" }).click();
  await expect(editor.locator("[dir='ltr']")).toHaveCount(1);
  await expect(editor.locator("[dir='rtl']")).toHaveCount(0);
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
  const { conversations, emailAccountId } = await openMail(page);
  const subject = `Shortcut Message ${testInfo.retry}`;
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const editor = dialog.locator("[contenteditable='true']");
  await dialog
    .getByRole("combobox", { name: "To" })
    .fill("recipient@example.com");
  await dialog.getByPlaceholder("Subject").fill(subject);
  await editor.pressSequentially("Draft body");
  await dialog.getByRole("button", { name: "Show signature" }).click();
  const signature = editor.locator("[data-smartmail]");
  await expect(signature).toBeVisible();
  await dialog.getByRole("button", { name: "Remove signature" }).click();
  await expect(signature).toHaveCount(0);

  await editor.press("ControlOrMeta+Enter");

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
  const sentBody = page
    .frameLocator('iframe[title="Email content preview"]')
    .locator("body");
  await expect(sentBody).toHaveText("Draft body");
  expect(await sentBody.evaluate((element) => element.innerText)).toBe(
    "Draft body",
  );
});

test("attaches files and discards a compose draft with shortcuts", async ({
  page,
}, testInfo) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();

  const dialog = page.getByRole("dialog", { name: "New Message" });
  const editor = dialog.locator("[contenteditable='true']");
  const attachButton = dialog.getByRole("button", { name: "Attach files" });
  await attachButton.hover();
  await expect(page.getByRole("tooltip")).toContainText("Attach files");
  await expect(page.getByRole("tooltip").locator("kbd")).toHaveText([
    "⌘",
    "shift",
    "U",
  ]);
  await capturePlaywrightCheckpoint(page, testInfo, "composer-shortcut-hint");

  const fileChooserPromise = page.waitForEvent("filechooser");
  await editor.press("ControlOrMeta+Shift+u");
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Attachment contents"),
  });
  await expect(dialog.getByRole("list", { name: "Attachments" })).toContainText(
    "notes.txt",
  );

  await editor.press("ControlOrMeta+Shift+,");
  await expect(dialog).toBeHidden();
});

test("edits a table signature with a hosted logo in place", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  const secondAccount = await createSecondEmailAccount(emailAccountId, {
    signature: TABLE_SIGNATURE_HTML,
  });

  try {
    await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    await page.getByRole("button", { name: /^Compose/ }).click();
    const dialog = page.getByRole("dialog", { name: "New Message" });
    await dialog.getByRole("combobox", { name: "From" }).click();
    await page
      .getByRole("option", {
        name: `${secondAccount.name} (${secondAccount.email})`,
        exact: true,
      })
      .click();

    const editor = dialog.getByRole("textbox", { name: "Email message" });
    await editor.pressSequentially("Body before the signature");
    await dialog.getByRole("button", { name: "Show signature" }).click();
    const signature = editor.locator("[data-smartmail]");
    await expect(signature.locator("table td")).toHaveCount(2);
    await expect(signature.locator("td").last()).toHaveCSS(
      "color",
      "rgb(51, 51, 51)",
    );
    const logo = signature.getByRole("img", { name: "Example Company" });
    await expect(logo).toBeAttached();
    // Composing never requests images from the sender's host directly.
    await expect(logo).not.toHaveAttribute(
      "src",
      /^https:\/\/assets\.example\.com/,
    );
    await capturePlaywrightCheckpoint(page, testInfo, "table-signature");

    await selectEditorText(editor, "Head of Examples");
    await page.keyboard.type("Chief Example Officer");
    await expect(signature).toContainText("Chief Example Officer");
    await expect(signature.locator("table")).toHaveCount(1);
    await expect(editor.locator(":scope > div").first()).toHaveText(
      "Body before the signature",
    );
    await capturePlaywrightCheckpoint(page, testInfo, "edited-table-signature");
    await dialog.getByRole("button", { name: "Discard draft" }).click();
  } finally {
    await deleteSecondEmailAccount(secondAccount.accountId);
  }
});

test("keeps pasted layout safely and restores it with the draft", async ({
  page,
}, testInfo) => {
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  const editor = dialog.getByRole("textbox", { name: "Email message" });
  await editor.pressSequentially("Numbers below");
  await editor.press("Enter");
  await editor.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData(
      "text/html",
      '<table style="border-collapse:collapse"><tbody><tr><td style="color:#0b6e4f;padding:4px 8px;border:1px solid #c8e6c9">Pasted cell</td></tr></tbody></table><img src="x" onerror="window.__pasteXss=1"><script>window.__pasteXss=1</script>',
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  });
  const pastedCell = editor.getByRole("cell", { name: "Pasted cell" });
  await expect(pastedCell).toHaveCSS("color", "rgb(11, 110, 79)");
  await expect(editor.locator("script, [onerror]")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as { __pasteXss?: number }).__pasteXss),
  ).toBeUndefined();
  await capturePlaywrightCheckpoint(page, testInfo, "pasted-styled-table");

  await dialog.getByRole("button", { name: "Close compose" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /^Compose/ }).click();
  await expect(editor).toContainText("Numbers below");
  await expect(editor.getByRole("cell", { name: "Pasted cell" })).toHaveCSS(
    "color",
    "rgb(11, 110, 79)",
  );
  await dialog.getByRole("button", { name: "Discard draft" }).click();
  await expect(dialog).toBeHidden();
});

const TABLE_SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse"><tbody><tr><td valign="top" style="padding-right:12px"><img src="https://assets.example.com/logo.png" width="48" height="48" alt="Example Company"></td><td valign="top" style="font-family:Arial,sans-serif;font-size:13px;color:#333333"><b>Example Person</b><br>Head of Examples<br><a href="https://example.com">example.com</a></td></tr></tbody></table>`;

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
