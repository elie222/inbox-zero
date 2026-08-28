import { expect, test } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("starts mailbox warming from the app shell before mail opens", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  const syncAccountIds = new Set<string>();

  await page.route("**/api/mobile/mailbox-sync", async (route) => {
    const syncAccountId = await route
      .request()
      .headerValue("X-Email-Account-ID");
    if (syncAccountId) syncAccountIds.add(syncAccountId);
    await route.fulfill({
      body: JSON.stringify({
        accountId: syncAccountId ?? emailAccountId,
        cursor: `${syncAccountId ?? emailAccountId}-cursor`,
        deletedMessageIds: [],
        hasMore: false,
        reset: false,
        upsertedMessages: [],
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto(`/${emailAccountId}/settings`);
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect.poll(() => [...syncAccountIds]).toContain(emailAccountId);
});

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
  await expect(page.getByRole("button", { name: /^Back/ })).toHaveCount(0);
  await expect(page.getByText(/^\d+ of \d+$/)).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(conversations).toBeVisible();
  await expect(readerConversation).toBeVisible();
  await expect(page).not.toHaveURL(/thread-id=/);
});

test("opening a conversation issues one detail request", async ({ page }) => {
  let threadDetailRequestCount = 0;
  const releaseFirstRequest = Promise.withResolvers<void>();

  await page.route(
    "**/api/threads/thr_playwright_reader?includeDrafts=true",
    async (route) => {
      threadDetailRequestCount += 1;
      const responsePromise = route.fetch();
      if (threadDetailRequestCount === 1) {
        await releaseFirstRequest.promise;
      }
      const response = await responsePromise;
      await route.fulfill({ response });
    },
  );
  const { conversations } = await openMail(page);
  expect(threadDetailRequestCount).toBe(0);

  const readerConversation = conversationWithSubject(
    page,
    conversations,
    "Re: Reader Navigation Message",
  );
  await readerConversation.click();
  await expect.poll(() => threadDetailRequestCount).toBe(1);
  await expect(
    page.getByRole("heading", { name: "Re: Reader Navigation Message" }),
  ).toBeVisible();
  await expect(page.getByTestId("thread-reader")).toHaveAttribute(
    "data-detail-selection-settled",
    "true",
  );
  expect(threadDetailRequestCount).toBe(1);
  releaseFirstRequest.resolve();

  await expect(
    page.getByRole("heading", { name: "Re: Reader Navigation Message" }),
  ).toBeVisible();
  await expect(
    page.getByText("First message in the reader conversation."),
  ).toBeVisible();
  expect(threadDetailRequestCount).toBe(1);
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

  await page.getByRole("button", { name: "Categories" }).click();
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

test("creates and edits a label and shows every keyboard workflow", async ({
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

  await page
    .getByRole("link", { name: labelName, exact: true })
    .click({ button: "right" });
  const editMenuItem = page.getByRole("menuitem", { name: "Edit" });
  await expect(editMenuItem).toBeVisible();
  await testInfo.attach("gmail-label-context-menu", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await editMenuItem.click();
  const editDialog = page.getByRole("dialog", { name: "Edit label" });
  const updatedLabelName = `${labelName} edited`;
  await editDialog
    .getByRole("textbox", { name: "label name" })
    .fill(updatedLabelName);
  await editDialog.getByRole("radio", { name: "Dark blue" }).click();
  await testInfo.attach("gmail-label-editor", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("link", { name: updatedLabelName, exact: true }),
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
