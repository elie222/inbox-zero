import { expect, test } from "@playwright/test";
import {
  cleanupSeededChat,
  getEmailAccountId,
  markAssistantOnboardingViewed,
  seedChat,
} from "./chat-test-helpers";

test.afterEach(async () => {
  await cleanupSeededChat();
});

test("opens, renames, starts fresh from, and deletes persisted chats", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  await seedChat(emailAccountId);
  await markAssistantOnboardingViewed(page);

  await page.goto(`/${emailAccountId}/assistant`);
  await expect(page).toHaveURL(new RegExp(`/${emailAccountId}/assistant`));
  await expect(page.getByTestId("chat-input")).toBeVisible();

  await page.getByRole("button", { name: "Chat History" }).click();
  await page.getByRole("menuitem", { name: "Inbox planning" }).click();
  await expect(
    page.getByText("Help me make a plan for today's inbox."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Start with unread mail, then review anything awaiting a reply.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Chat History" }).click();
  const chatRow = page
    .getByRole("menuitem", { name: "Inbox planning" })
    .locator("..");
  await chatRow.getByRole("button", { name: "Chat options" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();

  const renameDialog = page.getByRole("dialog", { name: "Rename chat" });
  await renameDialog.getByRole("textbox").fill("Daily inbox plan");
  await renameDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Chat renamed.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New Chat" }).click();
  await expect(page.getByTestId("chat-input")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Help me handle my inbox today" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Chat History" }).click();
  const renamedRow = page
    .getByRole("menuitem", { name: "Daily inbox plan" })
    .locator("..");
  await renamedRow.getByRole("button", { name: "Chat options" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  const deleteDialog = page.getByRole("alertdialog", { name: "Delete chat?" });
  await expect(deleteDialog).toContainText("Daily inbox plan");
  await deleteDialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Chat deleted.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Chat History" }).click();
  await expect(
    page.getByRole("menuitem", { name: "No previous chats found" }),
  ).toBeVisible();
});
