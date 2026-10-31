import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  clearWorkflowMailboxDrafts,
  conversationWithSubject,
  openMail,
} from "./mail-test-helpers";

test("keeps a reply's inline image visible before and after provider confirmation", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await clearWorkflowMailboxDrafts(page);
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Reply Workflow Message",
  ).click();
  const source = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await source.getByRole("button", { name: "Reply", exact: true }).click();
  await source
    .getByRole("textbox", { name: "Email message" })
    .fill("An inline image reply.");
  await source.getByTestId("compose-inline-image-input").setInputFiles({
    name: "inline-example.png",
    mimeType: "image/png",
    buffer: await readFile("public/splash_screens/icon.png"),
  });
  await expect(source.locator("img[data-content-id]")).toHaveCount(1);
  await expect(
    source.getByRole("list", { name: "Attachments" }).locator("li[aria-busy]"),
  ).toHaveCount(0, { timeout: 90_000 });
  await source.locator("img[data-content-id]").evaluate((image) => {
    image.setAttribute("width", "160");
    image.setAttribute("height", "160");
  });
  await source.getByRole("button", { name: "Send", exact: true }).click();

  const outgoing = page.locator(
    'li[data-thread-message-id^="outgoing:"]:not([aria-hidden="true"])',
  );
  await expect(outgoing).toBeVisible();
  const operationId = await outgoing.getAttribute("data-send-operation-id");
  expect(operationId).toBeTruthy();
  const row = page.locator(
    `li[data-send-operation-id="${operationId}"]:not([aria-hidden="true"])`,
  );
  const image = row
    .locator('iframe[title="Email content preview"]')
    .first()
    .contentFrame()
    .locator('img[src^="blob:"]');
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await capturePlaywrightCheckpoint(page, testInfo, "queued-inline-image");

  await expect(row).not.toHaveAttribute(
    "data-thread-message-id",
    /^outgoing:/,
    { timeout: 90_000 },
  );
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await capturePlaywrightCheckpoint(page, testInfo, "confirmed-inline-image");
});
