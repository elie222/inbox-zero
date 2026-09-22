import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { playwrightMailProvider } from "../mail-provider";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  conversationWithSubject,
  expectThreadReaderBody,
  openMail,
  openMailboxFromSidebar,
  readLatestMailMutation,
} from "./mail-test-helpers";

const openExternalLabel =
  playwrightMailProvider === "microsoft" ? "Open in Outlook" : "Open in Gmail";

test("opens a complete conversation and updates its read state", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  const readerConversation = conversationWithSubject(
    page,
    conversations,
    "Re: Reader Navigation Message",
  );
  await expect(readerConversation).toBeVisible();
  await expect(
    readerConversation.getByText("Dana Example, me", { exact: true }),
  ).toBeVisible();
  await expect(
    readerConversation.getByText("2", { exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    readerConversation,
    testInfo,
    "thread-list-participants",
  );

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

  const threadActions = page.getByRole("group", { name: "Thread actions" });
  const markUnread = threadActions.getByRole("button", {
    name: /Mark as unread/,
  });
  await expect(markUnread).toBeVisible();

  await page.getByRole("button", { name: /^More actions/ }).click();
  const move = page.getByRole("menuitem", { name: "Move" });
  await expect(move).toBeVisible();
  await expect(move).toContainText("V");
  const markSpam = page.getByRole("menuitem", { name: "Mark as spam" });
  await expect(markSpam).toContainText("!");
  const openExternal = page.getByRole("menuitem", {
    name: openExternalLabel,
  });
  await expect(openExternal).toContainText("G G");
  await page.keyboard.press("Escape");
  await expect(move).toBeHidden();
  await page.keyboard.press("KeyV");
  const moveDialog = page.getByRole("dialog", { name: "Move conversations" });
  await expect(moveDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(moveDialog).toBeHidden();
  await page.keyboard.press("KeyU");
  await expect(
    page.getByText("Marked as unread", { exact: true }),
  ).toBeVisible();
  await expect(conversations).toBeVisible();
  await expect(readerConversation).toBeVisible();
  await expect(page.getByText(/^\d+ of \d+$/)).toHaveCount(0);
  await expect(page).not.toHaveURL(/thread-id=/);
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "set_read_state",
          threadId: "thr_playwright_reader",
          payload: { read: false },
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ payload: { read: false }, status: "succeeded" });
});

test("opens a conversation from the engine without a thread-detail HTTP fetch", async ({
  page,
}) => {
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
  await expect.poll(() => threadDetailRequestCount).toBe(0);
  await expect(
    page.getByRole("heading", { name: "Re: Reader Navigation Message" }),
  ).toBeVisible();
  await expect(page.getByTestId("thread-reader")).toHaveAttribute(
    "data-detail-selection-settled",
    "true",
  );
  expect(threadDetailRequestCount).toBe(0);
  releaseFirstRequest.resolve();

  await expect(
    page.getByRole("heading", { name: "Re: Reader Navigation Message" }),
  ).toBeVisible();
  await expect(
    page.getByText("First message in the reader conversation."),
  ).toBeVisible();
  expect(threadDetailRequestCount).toBe(0);
});

test("waits for a direct reader snapshot before marking it read", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_label`);
  await expectThreadReaderBody(
    page,
    "This conversation is visible in the seeded project label.",
  );
  await expect(page.getByTestId("thread-reader")).toHaveAttribute(
    "data-detail-selection-settled",
    "true",
  );
  // Deep-link auto mark-read is skipped when the snapshot is already read, so
  // assert the settled reader rather than an inspect command that may not exist.
  await expect(
    page.getByRole("button", { name: /Mark as unread/ }),
  ).toBeVisible();
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
  await expect(page).toHaveURL(
    playwrightMailProvider === "microsoft"
      ? /labelId=Label_promotions/
      : /type=CATEGORY_PROMOTIONS/,
  );

  await page.getByRole("link", { name: /^Project Alpha/ }).click();
  await expect(
    conversationWithSubject(page, conversations, "Project Label Message"),
  ).toBeVisible();
  await expect(conversations.getByRole("option")).toHaveCount(1);
  await expect(page).toHaveURL(/labelId=Label_project/);
});

test("navigates drafts and sent mail from the sidebar", async ({ page }) => {
  const { conversations } = await openMail(page);

  await openMailboxFromSidebar(page, "Drafts");
  const draft = conversationWithSubject(
    page,
    conversations,
    "Seeded Draft Message",
  );
  await expect(draft).toBeVisible();
  await expect(draft.getByText("Draft", { exact: true })).toBeVisible();
  await expect(draft.getByText("Jordan Example")).toBeVisible();

  await openMailboxFromSidebar(page, "Sent");
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
  const labelType =
    playwrightMailProvider === "microsoft" ? "category" : "label";

  await page.getByRole("button", { name: `Create ${labelType}` }).click();
  await page
    .getByRole("textbox", { name: `New ${labelType} name` })
    .fill(labelName);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("link", { name: labelName, exact: true }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: labelName, exact: true })
    .click({ button: "right" });
  const editMenuItem = page.getByRole("menuitem", { name: "Edit" });
  await expect(editMenuItem).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    `${playwrightMailProvider}-label-context-menu`,
  );
  await editMenuItem.click();
  const editDialog = page.getByRole("dialog", { name: `Edit ${labelType}` });
  if (playwrightMailProvider === "microsoft") {
    await expect(editDialog.getByRole("textbox")).toHaveCount(0);
    await editDialog.getByRole("radio", { name: "Dark blue" }).click();
    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(editDialog).toBeHidden();
    await page.reload();
    await page
      .getByRole("link", { name: labelName, exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await expect(
      editDialog.getByRole("radio", { name: "Dark blue" }),
    ).toHaveAttribute("aria-checked", "true");
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "outlook-category-editor",
    );
    await editDialog.getByRole("button", { name: "Cancel" }).click();
  } else {
    const updatedLabelName = `${labelName} edited`;
    await editDialog
      .getByRole("textbox", { name: "label name" })
      .fill(updatedLabelName);
    await editDialog.getByRole("radio", { name: "Dark blue" }).click();
    await capturePlaywrightCheckpoint(page, testInfo, "gmail-label-editor");
    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByRole("link", { name: updatedLabelName, exact: true }),
    ).toBeVisible();

    const createLabel = async (name: string) => {
      await page.getByRole("button", { name: "Create label" }).click();
      await page.getByRole("textbox", { name: "New label name" }).fill(name);
      await page.getByRole("button", { name: "Add", exact: true }).click();
    };

    // A branch starts closed, so each nested label stays out of sight until its
    // parent is expanded.
    const child = page.getByRole("link", { name: "Clients", exact: true });
    const grandchild = page.getByRole("link", { name: "Acme", exact: true });

    await createLabel(`${updatedLabelName}/Clients`);
    const expandParent = page.getByRole("button", {
      name: `Expand ${updatedLabelName}`,
      exact: true,
    });
    await expect(expandParent).toBeVisible();
    await expect(child).toBeHidden();
    await expandParent.click();
    await expect(child).toBeVisible();

    await createLabel(`${updatedLabelName}/Clients/Acme`);
    const expandChild = page.getByRole("button", {
      name: `Expand ${updatedLabelName}/Clients`,
      exact: true,
    });
    await expect(expandChild).toBeVisible();
    await expect(grandchild).toBeHidden();
    await expandChild.click();
    await expect(grandchild).toBeVisible();
    await capturePlaywrightCheckpoint(page, testInfo, "gmail-nested-labels");
    await page
      .getByRole("button", {
        name: `Collapse ${updatedLabelName}`,
        exact: true,
      })
      .click();
    await expect(child).toBeHidden();
    await expect(grandchild).toBeHidden();
    // Re-expanding only reopens the level that was collapsed; deeper branches
    // come back closed.
    await expandParent.click();
    await expect(child).toBeVisible();
    await expect(grandchild).toBeHidden();
    await expandChild.click();
    await grandchild.click();
    await expect(grandchild).toHaveAttribute("aria-current", "page");
    const selectedLabelUrl = page.url();
    await page
      .getByRole("button", {
        name: `Collapse ${updatedLabelName}`,
        exact: true,
      })
      .click();
    await expect(grandchild).toBeHidden();
    await page.getByRole("link", { name: /^Inbox(?:\s+\d+)?$/ }).click();
    await expect(page).toHaveURL(/type=inbox/);
    await expect(grandchild).toBeHidden();
    await page.goBack();
    await expect(page).toHaveURL(selectedLabelUrl);
    await expect(grandchild).toBeVisible();
    await expect(grandchild).toHaveAttribute("aria-current", "page");
    await grandchild.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await expect(
      editDialog.getByRole("textbox", { name: "label name" }),
    ).toHaveValue(`${updatedLabelName}/Clients/Acme`);
    await editDialog.getByRole("button", { name: "Cancel" }).click();
  }
});
