import { expect } from "@playwright/test";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  expectThreadReaderBody,
  openMail,
  readLatestMailMutation,
} from "./mail-test-helpers";

test("captures thread reading and reply states", async ({ page }, testInfo) => {
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reader`);
  await expect(
    page.getByText(
      "A second message proves the complete conversation is rendered.",
    ),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "01-collapsed-history");
  const collapsed = page
    .locator('[role="button"][aria-expanded="false"]')
    .filter({ hasText: "Dana Example" });
  if (await collapsed.count()) await collapsed.click();
  await expect(
    page.getByText("First message in the reader conversation."),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "02-expanded-history");
  await page
    .getByRole("button", { name: "Show details", exact: true })
    .last()
    .click();
  await expect(page.getByText("From", { exact: true })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "03-header-details");
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  const replyMessage = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  const collapsedReply = replyMessage.locator(
    '[role="button"][aria-expanded="false"]',
  );
  await expect(replyMessage).toBeVisible();
  if (await collapsedReply.count()) await collapsedReply.click();
  await expect(
    replyMessage.getByText("Please reply to this seeded conversation."),
  ).toBeVisible();
  const toolbar = page.getByRole("group", { name: "Thread actions" });
  await expect(
    toolbar.getByRole("button", { name: "Reply", exact: true }),
  ).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: /^Delete/ })).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "04-single-message");
  await toolbar.getByRole("button", { name: /^More actions/ }).click();
  await expect(page.getByRole("menuitem", { name: /^Delete/ })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "25-thread-actions-menu");
  await page.keyboard.press("Escape");
  await replyMessage
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  const editor = page.locator("[contenteditable='true']");
  await expect(editor).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "05-empty-reply");
  await editor.pressSequentially(
    "Thanks Leslie, Thursday at 2 pm works for me. I will bring the updated proposal.",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "06-populated-reply");
  await page.getByRole("button", { name: /^Draft to Leslie/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Cc", exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "07-reply-recipients");
  await page
    .getByRole("button", { name: "Hide recipients", exact: true })
    .click();
  await expect(editor).toContainText(
    "Thanks Leslie, Thursday at 2 pm works for me.",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reply Workflow Message" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "08-draft-after-reload");
  await page.getByRole("button", { name: "Reply", exact: true }).last().click();
  await editor.fill("A reply that should survive navigation.");
  await expect(editor).toContainText("A reply that should survive navigation.");
  await page.goto(`/${emailAccountId}/mail`);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  await expect(
    page.getByRole("heading", { name: "Reply Workflow Message" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "12-draft-after-navigation",
  );
  if (!(await editor.count()) || !(await editor.first().isVisible())) {
    await page
      .getByRole("button", { name: "Reply", exact: true })
      .last()
      .click();
  }
  await expect(editor).toBeVisible();
  await editor.fill("Mobile reply: the proposed time works well.");
  await page.setViewportSize({ width: 390, height: 844 });
  await capturePlaywrightCheckpoint(page, testInfo, "13-mobile-reply");
});

test("captures queued reply and reconnect", async ({ page }, testInfo) => {
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  await expect(
    page.getByRole("heading", { name: "Reply Workflow Message" }),
  ).toBeVisible();
  const initialResponse = await page.request.get(
    "/api/threads/thr_playwright_reply?includeDrafts=true",
    { headers: { "X-Email-Account-ID": emailAccountId } },
  );
  expect(initialResponse.ok()).toBe(true);
  const initialThread: ThreadResponse = await initialResponse.json();
  const initialSentIds = initialThread.thread.messages
    .filter((message) => message.labelIds?.includes("SENT"))
    .map((message) => message.id);
  const replyBody = `Confirmed, see you Thursday. This reply is sent only inside the local emulator. Attempt ${testInfo.retry}.`;
  const editor = page.locator("[contenteditable='true']");
  if (!(await editor.count()))
    await page
      .getByRole("button", { name: "Reply", exact: true })
      .last()
      .click();
  await expect(editor).toBeVisible();
  await editor.fill(replyBody);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event("offline"));
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_playwright_reply",
      }),
    )
    .toMatchObject({ status: "reconciling" });
  const queuedToast = page.locator("[data-sonner-toast]").filter({
    hasText: "Email queued. It will send when you're back online.",
  });
  const delivery = page.getByRole("region", {
    name: "Reply delivery status",
  });
  await expect(
    delivery.getByText("Waiting for connection", { exact: true }),
  ).toBeVisible();
  await expect(queuedToast).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "09-queued-reply");
  await expect(queuedToast).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "10-queued-after-toast");
  await page
    .evaluate(() => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => true,
      });
      window.dispatchEvent(new Event("online"));
    })
    .catch((error) => {
      if (!String(error).includes("Execution context was destroyed"))
        throw error;
    });
  await expect(
    page.getByRole("heading", { name: /Reply Workflow Message/ }),
  ).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: "thr_playwright_reply",
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({
      status: expect.stringMatching(/^(succeeded|reconciling)$/),
    });
  await expectThreadReaderBody(page, replyBody);
  const response = await page.request.get(
    "/api/threads/thr_playwright_reply?includeDrafts=true",
    { headers: { "X-Email-Account-ID": emailAccountId } },
  );
  expect(response.ok()).toBe(true);
  const body: ThreadResponse = await response.json();
  const sentMessages = body.thread.messages.filter((message) =>
    message.labelIds?.includes("SENT"),
  );
  expect(sentMessages).toHaveLength(initialSentIds.length + 1);
  const appended = sentMessages.filter(
    (message) => !initialSentIds.includes(message.id),
  );
  expect(appended).toHaveLength(1);
  expect(
    `${appended[0].textPlain ?? ""}${appended[0].textHtml ?? ""}`,
  ).toContain(replyBody);
  await capturePlaywrightCheckpoint(page, testInfo, "11-sent-reply");
});

test("captures a longer thread and draft collapse", async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reader`);
  await expect(
    page.getByText(
      "A second message proves the complete conversation is rendered.",
    ),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "14-long-thread");
  await page.getByRole("button", { name: "Reply", exact: true }).last().click();
  const editor = page.locator("[contenteditable='true']");
  await editor.fill("This reply should survive collapsing its parent message.");
  const header = page
    .locator('[role="button"][aria-expanded="true"]')
    .filter({ hasText: "Me" })
    .last();
  await header.click();
  await page
    .locator('[role="button"][aria-expanded="false"]')
    .filter({ hasText: "Me" })
    .last()
    .click();
  await expect(editor).toBeVisible();
  await expect(editor).toContainText(
    "This reply should survive collapsing its parent message.",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "15-draft-after-collapse");
});

test("restores a queued reply for editing without sending a duplicate", async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  await expect(
    page.getByRole("heading", { name: "Reply Workflow Message" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reply", exact: true }).last().click();
  const editor = page.getByRole("textbox", { name: "Email message" });
  const text = "I can review the updated proposal on Thursday.";
  await editor.fill(text);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event("offline"));
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const delivery = page.getByRole("region", { name: "Reply delivery status" });
  await expect(
    delivery.getByText("Waiting for connection", { exact: true }),
  ).toBeVisible();
  await delivery.getByRole("button", { name: "Edit reply" }).click();
  await expect(editor).toContainText(text);
  await expect(
    delivery.getByText("Waiting for connection", { exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_playwright_reply",
      }),
    )
    .toBeUndefined();
  await editor.fill(`${text} Let's meet at 3 pm.`);
  await expect(editor).toContainText("Let's meet at 3 pm.");
  await capturePlaywrightCheckpoint(page, testInfo, "22-edit-queued-reply");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reply Workflow Message" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_playwright_reply",
      }),
    )
    .toBeUndefined();
});
