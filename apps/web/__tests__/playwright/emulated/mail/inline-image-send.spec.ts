import { readFile } from "node:fs/promises";
import { expect, type Locator } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import {
  clearWorkflowMailboxDrafts,
  conversationWithSubject,
  openMail,
} from "./mail-test-helpers";

test("keeps both inline images visible before and after provider confirmation", async ({
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
  const [first, second] = await Promise.all([
    readFile("public/icons/icon-192x192.png"),
    readFile("public/icons/icon-512x512.png"),
  ]);
  await source.getByTestId("compose-inline-image-input").setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: first },
    { name: "second.png", mimeType: "image/png", buffer: second },
  ]);
  const composerImages = source.locator("img[data-content-id]");
  await expect(composerImages).toHaveCount(2);
  await expect(
    source.getByRole("list", { name: "Attachments" }).locator("li[aria-busy]"),
  ).toHaveCount(0, { timeout: 90_000 });
  await composerImages.evaluateAll((images) => {
    for (const image of images) {
      image.setAttribute("width", "160");
      image.setAttribute("height", "160");
    }
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
  await expectBothImagesLoaded(outgoing);
  await capturePlaywrightCheckpoint(page, testInfo, "queued-inline-image");

  await expect(row).not.toHaveAttribute(
    "data-thread-message-id",
    /^outgoing:/,
    { timeout: 90_000 },
  );
  await expectBothImagesLoaded(row);
  await capturePlaywrightCheckpoint(page, testInfo, "confirmed-inline-image");
});

async function expectBothImagesLoaded(row: Locator) {
  const images = row
    .locator('iframe[title="Email content preview"]')
    .first()
    .contentFrame()
    .locator('img[alt="first.png"], img[alt="second.png"]');
  await expect
    .poll(() =>
      images.evaluateAll((images: HTMLImageElement[]) =>
        images
          .filter((image) => image.complete && image.naturalWidth > 0)
          .map((image) => image.alt)
          .sort(),
      ),
    )
    .toEqual(["first.png", "second.png"]);
}
