import { expect, type Locator } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
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
    .getByRole("checkbox", { name: "Select conversation with Erin Example" })
    .click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Archive", exact: true }).click();

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

test("advances the split reader after archiving an open conversation", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  await page.getByRole("button", { name: "Switch list or split view" }).click();
  const conversation = conversationWithSubject(
    page,
    conversations,
    "Second Unread Command Message",
  );
  await conversation.click();
  await expect(
    page.getByRole("heading", { name: "Second Unread Command Message" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(conversation).toHaveCount(0);

  try {
    await page.getByRole("button", { name: "Archive", exact: true }).click();

    await expect(conversations).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("thread-id"))
      .not.toBe("thr_playwright_3");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("thread-id"))
      .not.toBeNull();
    await expect(
      page.getByRole("button", { name: "Archive", exact: true }),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "split-reader-after-archive",
    );
  } finally {
    const restoreResponse = await page.request.post(
      "/api/threads/thr_playwright_3/unarchive",
      { headers: { "X-Email-Account-ID": emailAccountId } },
    );
    expect(restoreResponse.ok()).toBeTruthy();
  }
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
  await expect(page).toHaveURL(/thread-id=/);
  await page.keyboard.press("Escape");
  await expect(conversations).toBeVisible();
});

test("selects every conversation with Command A", async ({ page }) => {
  const { conversations } = await openMail(page);
  const options = conversations.getByRole("option");
  const conversationCount = await options.count();
  expect(conversationCount).toBeGreaterThan(1);

  // The toolbar slot is the mail search input now, so open the palette with
  // its keyboard shortcut instead.
  await page.keyboard.press(`${commandModifier}+KeyK`);
  const commandInput = page.getByPlaceholder("Type a command or search...");
  const query = "archive";
  await commandInput.fill(query);
  await page.keyboard.press(`${commandModifier}+KeyA`);

  await expect
    .poll(() =>
      commandInput.evaluate((input: HTMLInputElement) => ({
        end: input.selectionEnd,
        start: input.selectionStart,
      })),
    )
    .toEqual({ end: query.length, start: 0 });
  await expect.poll(() => allRowsAreSelected(options, false)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(commandInput).toBeHidden();

  await options.nth(1).getByRole("checkbox").click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();

  await page.keyboard.press(`${commandModifier}+KeyA`);

  await expect(
    page.getByText(`${conversationCount} selected`, { exact: true }),
  ).toBeVisible();
  await expect(options).toHaveCount(conversationCount);
  await expect.poll(() => allRowsAreSelected(options, true)).toBe(true);
});

function allRowsAreSelected(rows: Locator, selected: boolean) {
  return rows.evaluateAll(
    (options, expected) =>
      options.every(
        (option) => option.getAttribute("aria-selected") === String(expected),
      ),
    selected,
  );
}
