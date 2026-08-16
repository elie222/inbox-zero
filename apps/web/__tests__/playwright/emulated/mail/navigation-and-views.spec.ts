import { expect, test } from "@playwright/test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("opens a complete conversation and updates its read state", async ({
  page,
}) => {
  const { conversations } = await openMail(page);
  const readerConversation = conversationWithSubject(
    page,
    conversations,
    "Re: Reader Navigation Message",
  );
  await expect(readerConversation).toBeVisible();

  await readerConversation.click();

  await expect(
    page.getByRole("heading", { name: "Re: Reader Navigation Message" }),
  ).toBeVisible();
  await expect(
    page.getByText("First message in the reader conversation."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A second message proves the complete conversation is rendered.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/thread-id=thr_playwright_reader/);

  await page.getByRole("button", { name: /^More actions/ }).click();
  const markUnread = page.getByRole("menuitem", { name: "Mark as unread" });
  await expect(markUnread).toBeVisible();
  await markUnread.click();
  await expect(
    page.getByText("Marked as unread", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^More actions/ }).click();
  const markRead = page.getByRole("menuitem", { name: "Mark as read" });
  await expect(markRead).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(markRead).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Re: Reader Navigation Message" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/thread-id=thr_playwright_reader/);

  await page.getByRole("button", { name: /^Back/ }).click();
  await expect(conversations).toBeVisible();
  await expect(readerConversation).toBeVisible();
  await expect(page).not.toHaveURL(/thread-id=/);
});

test("filters the mail list by state, category, and label", async ({
  page,
}) => {
  const { conversations } = await openMail(page);

  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(
    conversationWithSubject(page, conversations, "Keyboard Navigation Message"),
  ).toBeVisible();
  await expect(
    conversationWithSubject(page, conversations, "Read Command Message"),
  ).toHaveCount(0);

  await page.getByRole("link", { name: /^Promotions/ }).click();
  await expect(
    conversationWithSubject(page, conversations, "Promotion Category Message"),
  ).toBeVisible();
  await expect(conversations.getByRole("option")).toHaveCount(1);
  await expect(page).toHaveURL(/type=CATEGORY_PROMOTIONS/);

  await page.getByRole("link", { name: /^Project Alpha/ }).click();
  await expect(
    conversationWithSubject(page, conversations, "Project Label Message"),
  ).toBeVisible();
  await expect(conversations.getByRole("option")).toHaveCount(1);
  await expect(page).toHaveURL(/labelId=Label_project/);
});

test("navigates drafts and sent mail from the sidebar", async ({ page }) => {
  const { conversations } = await openMail(page);

  await page.getByRole("link", { name: /^Drafts/ }).click();
  const draft = conversationWithSubject(
    page,
    conversations,
    "Seeded Draft Message",
  );
  await expect(draft).toBeVisible();
  await expect(draft.getByText("Draft", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /^Sent/ }).click();
  await expect(
    conversationWithSubject(page, conversations, "Seeded Sent Message"),
  ).toBeVisible();
  await expect(draft).toHaveCount(0);
});

test("creates a label and shows every keyboard workflow", async ({
  page,
}, testInfo) => {
  await openMail(page);
  const labelName = `Daily QA ${testInfo.retry}`;

  await page.getByRole("button", { name: "Create label" }).click();
  await page.getByRole("textbox", { name: "New label name" }).fill(labelName);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("link", { name: labelName, exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Keyboard shortcuts/ }).click();
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Next message", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Archive", { exact: true })).toBeVisible();
  await expect(dialog.getByText("New message", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Send reply", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
