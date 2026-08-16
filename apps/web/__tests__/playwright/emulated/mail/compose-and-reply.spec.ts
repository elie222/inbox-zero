import { expect, test } from "@playwright/test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

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
  const replyBody = `A reply sent through the mail reader. ${testInfo.retry}`;
  await replyEditor.pressSequentially(replyBody);
  await expect(replyEditor).toContainText(replyBody);
  await page.getByRole("button", { name: /^Send/ }).click();

  await expect(page.getByText("Email sent!", { exact: true })).toBeVisible();
  await expect(sentByMe).toHaveCount(initialSentByMeCount + 1);
});
