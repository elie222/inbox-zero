import { expect } from "@playwright/test";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

test("keeps arrow navigation inside the thread and expands from its toolbar", async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reader`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByText(
      "A second message proves the complete conversation is rendered.",
    ),
  ).toBeVisible();
  const threadUrl = page.url();
  const messages = page.locator("li[data-thread-message-id]");
  const selected = page.locator('li[aria-current="true"]');
  await expect(messages).toHaveCount(2);
  await expect(selected).toHaveCount(1);
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowUp");
  await expect(messages.first()).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowUp");
  await expect(messages.first()).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(threadUrl);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "navigation-selected-message",
  );
  await page.keyboard.press("ArrowDown");
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowDown");
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(threadUrl);
  const toolbar = page.getByRole("group", { name: "Thread actions" });
  const expand = toolbar.getByRole("button", {
    name: "Expand all messages",
    exact: true,
  });
  await expect(
    page.getByRole("button", { name: "Expand all messages", exact: true }),
  ).toHaveCount(1);
  await expand.click();
  await expect(
    page.getByText("First message in the reader conversation."),
  ).toBeVisible();
  await toolbar
    .getByRole("button", { name: "Collapse all messages", exact: true })
    .click();
  await expect(
    messages.first().locator('[role="button"][aria-expanded]'),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(expand).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "navigation-mobile-toolbar",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await messages.last().focus();
  await page.keyboard.press("Enter");

  const editor = page.getByRole("textbox", { name: "Email message" });
  await expect(editor).toBeFocused();
  await expect(editor.locator("p")).toHaveText("");
  await page.getByLabel("Show quoted message").click();
  await expect(
    page.getByRole("toolbar", { name: "Selection formatting" }),
  ).toBeHidden();
  await page.getByLabel("Hide quoted message").click();
  await expect(
    page.getByRole("toolbar", { name: "Selection formatting" }),
  ).toBeHidden();
  await editor.fill(
    "A reply on the first line.\nAnother line for cursor navigation.",
  );
  await page.keyboard.press("ArrowUp");
  await expect(editor).toBeFocused();
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowDown");
  await expect(editor).toBeFocused();
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(threadUrl);
});

test("navigates messages from inside a rich email body", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.route("**/api/threads/thr_playwright_reader?**", async (route) => {
    const response = await route.fetch();
    const body: ThreadResponse = await response.json();
    const last = body.thread.messages.at(-1);
    expect(last).toBeDefined();
    if (!last) throw new Error("Reader fixture has no messages");
    last.textHtml = "<p>A rich email body for keyboard navigation.</p>";
    await route.fulfill({ response, json: body });
  });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reader`, {
    waitUntil: "domcontentloaded",
  });
  const emailBody = page
    .frameLocator('iframe[title="Email content preview"]')
    .last()
    .getByText("A rich email body for keyboard navigation.");
  await expect(emailBody).toBeVisible();
  const threadUrl = page.url();
  const messages = page.locator("li[data-thread-message-id]");
  await emailBody.click();
  await page.keyboard.press("ArrowUp");
  await expect(messages.first()).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(threadUrl);
  await page.keyboard.press("ArrowDown");
  await expect(messages.last()).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(threadUrl);
  await emailBody.click();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "Email message" }),
  ).toBeVisible();
});

test("expands a collapsed message before Enter opens a reply", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reader`, {
    waitUntil: "domcontentloaded",
  });

  const message = page.locator("li[data-thread-message-id]").first();
  const header = message.locator('[role="button"][aria-expanded]');
  const editor = message.getByRole("textbox", { name: "Email message" });
  await expect(header).toHaveAttribute("aria-expanded", "false");

  await message.focus();
  await page.keyboard.press("Enter");

  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(message.locator(".animate-spin")).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "collapsed-message-expanded-with-enter",
  );

  await message.focus();
  await page.keyboard.press("Enter");
  await expect(editor).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Email message" }),
  ).toHaveCount(1);
});
