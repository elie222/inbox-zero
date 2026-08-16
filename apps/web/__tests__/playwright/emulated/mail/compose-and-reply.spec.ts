import { expect, test } from "@playwright/test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("composes, sends, and reads a new message from Sent", async ({ page }) => {
  const { conversations } = await openMail(page);

  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog
    .getByRole("textbox", { name: "To" })
    .fill("recipient@example.com");
  await dialog.getByPlaceholder("Subject").fill("Playwright Composed Message");
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
    "Playwright Composed Message",
  );
  await expect(sentConversation).toBeVisible();
  await sentConversation.click();
  await expect(
    page.getByRole("heading", { name: "Playwright Composed Message" }),
  ).toBeVisible();
  await expect(page.getByText("recipient@example.com").first()).toBeVisible();
});

test("replies inside an existing conversation", async ({ page }) => {
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

  await page.getByRole("button", { name: /^Reply R$/ }).click();
  const replyEditor = page.locator("[contenteditable='true']");
  await expect(replyEditor).toBeVisible();
  await replyEditor.pressSequentially("A reply sent through the mail reader.");
  await expect(replyEditor).toContainText(
    "A reply sent through the mail reader.",
  );
  await page.getByRole("button", { name: /^Send/ }).click();

  await expect(page.getByText("Email sent!", { exact: true })).toBeVisible();
  await expect(page.getByText("Me", { exact: true })).toBeVisible();
});
