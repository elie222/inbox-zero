import { expect, test } from "@playwright/test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

const commandModifier = process.platform === "darwin" ? "Meta" : "Control";

test("archives a selected conversation and restores it with undo", async ({
  page,
}) => {
  const { conversations } = await openMail(page);
  const archiveConversation = conversationWithSubject(
    page,
    conversations,
    "Archive Action Message",
  );

  await archiveConversation
    .getByRole("checkbox", { name: "Select conversation from Erin Example" })
    .click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Archive E$/ }).click();

  await expect(archiveConversation).toHaveCount(0);
  const notifications = page.getByRole("region", {
    name: "Notifications alt+T",
  });
  await expect(
    notifications.getByText("Archived", { exact: true }),
  ).toBeVisible();
  await notifications.getByRole("button", { name: /^Undo/ }).click();
  await expect(archiveConversation).toBeVisible();
});

test("deletes an open conversation and returns to the list", async ({
  page,
}) => {
  const { conversations, emailAccountId } = await openMail(page);
  const deletedConversation = conversationWithSubject(
    page,
    conversations,
    "Delete Action Message",
  );
  await deletedConversation.click();
  await expect(
    page.getByRole("heading", { name: "Delete Action Message" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Delete \(/ }).click();

  await expect(conversations).toBeVisible();
  await expect(deletedConversation).toHaveCount(0);
  await expect(page.getByText("Deleted", { exact: true })).toBeVisible();

  const restoreResponse = await page.request.post(
    "/api/threads/thr_playwright_delete/untrash",
    { headers: { "X-Email-Account-ID": emailAccountId } },
  );
  expect(restoreResponse.ok()).toBeTruthy();
});

test("selects ranges and opens conversations with the keyboard", async ({
  page,
}) => {
  const { conversations } = await openMail(page);
  const options = conversations.getByRole("option");
  await expect(options.first()).toBeVisible();

  await page.keyboard.press("x");
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await page.keyboard.press("Shift+j");
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("2 selected", { exact: true })).toBeHidden();

  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Back/ })).toBeVisible();
  await expect(page).toHaveURL(/thread-id=/);
  await page.keyboard.press("Escape");
  await expect(conversations).toBeVisible();
});

test("selects every conversation with Command A", async ({ page }) => {
  const { conversations } = await openMail(page);
  const options = conversations.getByRole("option");
  const conversationCount = await options.count();
  expect(conversationCount).toBeGreaterThan(1);

  await options.nth(1).getByRole("checkbox").click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();

  await page.keyboard.press(`${commandModifier}+KeyA`);

  await expect(
    page.getByText(`${conversationCount} selected`, { exact: true }),
  ).toBeVisible();
  await expect(options).toHaveCount(conversationCount);
  await expect
    .poll(() =>
      options.evaluateAll((rows) =>
        rows.every((row) => row.getAttribute("aria-selected") === "true"),
      ),
    )
    .toBe(true);
});
