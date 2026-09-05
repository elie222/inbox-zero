import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail, readLatestMailMutation } from "./mail-test-helpers";

test("captures thread reading and reply states", async ({ page }, testInfo) => {
  page.setDefaultTimeout(15_000);
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
  await expect(page.getByText("From:", { exact: true })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "03-header-details");
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  await expect(
    page.getByText("Please reply to this seeded conversation."),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "04-single-message");
  await page
    .getByRole("group", { name: "Thread actions" })
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  const editor = page.locator("[contenteditable='true']");
  await expect(editor).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "05-empty-reply");
  await editor.pressSequentially(
    "Thanks Leslie, Thursday at 2 pm works for me. I will bring the updated proposal.",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "06-populated-reply");
  await page.getByRole("button", { name: /^To Leslie/ }).click();
  await page.getByRole("button", { name: "Cc/Bcc", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Cc", exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "07-reply-recipients");
  await page.getByRole("button", { name: "Hide Cc/Bcc", exact: true }).click();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reply Workflow Message" }),
  ).toBeVisible();
  await expect(editor).toContainText(
    "Thanks Leslie, Thursday at 2 pm works for me.",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "08-draft-after-reload");
  if (!(await editor.count()))
    await page
      .getByRole("group", { name: "Thread actions" })
      .getByRole("button", { name: "Reply", exact: true })
      .click();
  await editor.fill("A reply that should survive navigation.");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.goto(`/${emailAccountId}/mail`);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  await expect(
    page.getByRole("heading", { name: "Reply Workflow Message" }),
  ).toBeVisible();
  await expect(editor).toContainText("A reply that should survive navigation.");
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "12-draft-after-navigation",
  );
  if (!(await editor.count()))
    await page
      .getByRole("group", { name: "Thread actions" })
      .getByRole("button", { name: "Reply", exact: true })
      .click();
  await editor.fill("Mobile reply: the proposed time works well.");
  await page.setViewportSize({ width: 390, height: 844 });
  await capturePlaywrightCheckpoint(page, testInfo, "13-mobile-reply");
});

test("captures queued reply and reconnect", async ({ page }, testInfo) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  await expect(
    page.getByRole("heading", { name: "Reply Workflow Message" }),
  ).toBeVisible();
  const editor = page.locator("[contenteditable='true']");
  if (!(await editor.count()))
    await page
      .getByRole("group", { name: "Thread actions" })
      .getByRole("button", { name: "Reply", exact: true })
      .click();
  await expect(editor).toBeVisible();
  await editor.fill(
    "Confirmed, see you Thursday. This reply is sent only inside the local emulator.",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    }),
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(() =>
      readLatestMailMutation(page, {
        emailAccountId,
        kind: "reply",
        threadId: "thr_playwright_reply",
      }),
    )
    .toMatchObject({ status: "pending" });
  await capturePlaywrightCheckpoint(page, testInfo, "09-queued-reply");
  await page.waitForTimeout(5500);
  await capturePlaywrightCheckpoint(page, testInfo, "10-queued-after-toast");
  const queuedReply = await readLatestMailMutation(page, {
    emailAccountId,
    kind: "reply",
    threadId: "thr_playwright_reply",
  });
  expect(queuedReply?.id).toEqual(expect.any(String));
  const releaseSend = Promise.withResolvers<void>();
  let sendRequestStarted = false;
  // Web sends use a Next server action on the current page URL.
  await page.route(page.url(), async (route) => {
    if (
      route.request().method() !== "POST" ||
      !route.request().postData()?.includes(`"mutationId":"${queuedReply?.id}"`)
    ) {
      await route.continue();
      return;
    }
    sendRequestStarted = true;
    await releaseSend.promise;
    await route.continue();
  });
  try {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => true,
      });
      window.dispatchEvent(new Event("online"));
    });
    await expect.poll(() => sendRequestStarted, { timeout: 60_000 }).toBe(true);
    await expect(
      page
        .getByRole("region", { name: "Reply delivery status" })
        .getByText("Sending…", { exact: true }),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(page, testInfo, "24-sending-reply");
  } finally {
    releaseSend.resolve();
  }
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
    .toMatchObject({ status: "succeeded" });
  await expect(
    page
      .frameLocator('iframe[title="Email content preview"]')
      .getByText(
        "Confirmed, see you Thursday. This reply is sent only inside the local emulator.",
      ),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "11-sent-reply");
});

test("captures a longer thread and draft collapse", async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/threads/thr_playwright_reader?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const first = body.thread.messages[0];
    body.thread.messages = [
      ...Array.from({ length: 6 }, (_, index) => ({
        ...first,
        id: `gallery-history-${index}`,
        labelIds: ["INBOX"],
        headers: {
          ...first.headers,
          date: new Date(Date.UTC(2025, 0, 1, 9, index)).toISOString(),
          from:
            index % 2
              ? "Morgan Example <morgan@example.com>"
              : "Dana Example <dana@example.com>",
        },
        internalDate: String(Date.UTC(2025, 0, 1, 9, index)),
        textPlain: `Planning update ${index + 1}: the proposal is ready for our review.`,
        snippet: `Planning update ${index + 1}: the proposal is ready for our review.`,
      })),
      ...body.thread.messages,
    ];
    await route.fulfill({ response, json: body });
  });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reader`);
  await expect(
    page.getByText(
      "A second message proves the complete conversation is rendered.",
    ),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "14-long-thread");
  await page
    .getByRole("group", { name: "Thread actions" })
    .getByRole("button", { name: "Reply", exact: true })
    .click();
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
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reply`);
  await expect(
    page.getByRole("heading", { name: "Reply Workflow Message" }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Thread actions" })
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "Email message" });
  const text = "I can review the updated proposal on Thursday.";
  await editor.fill(text);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    }),
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const delivery = page.getByRole("region", { name: "Reply delivery status" });
  await expect(
    delivery.getByText("Reply queued", { exact: true }),
  ).toBeVisible();
  await delivery.getByRole("button", { name: "Edit reply" }).click();
  await expect(editor).toContainText(text);
  await expect(delivery.getByText("Reply queued", { exact: true })).toHaveCount(
    0,
  );
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
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "22-edit-queued-reply");
  await page.reload();
  await expect(editor).toContainText("Let's meet at 3 pm.");
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
