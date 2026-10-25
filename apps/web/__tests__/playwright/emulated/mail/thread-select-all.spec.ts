import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { expectThreadReaderBody, openMail } from "./mail-test-helpers";

test("select all inside a message body selects and copies the whole thread", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(
    `/${emailAccountId}/mail?thread-id=thr_playwright_matched_reason`,
    { waitUntil: "domcontentloaded" },
  );
  const expand = page.getByRole("button", {
    name: "Expand all messages",
    exact: true,
  });
  await expectThreadReaderBody(page, "Later message body.");
  if (await expand.isVisible()) await expand.click();
  await expectThreadReaderBody(page, "Earlier message body.");

  const bodies = page.locator('iframe[title="Email content preview"]');
  await expect(bodies).toHaveCount(2);
  await bodies
    .first()
    .contentFrame()
    .getByText("Earlier message body.")
    .click();
  await page.keyboard.press("ControlOrMeta+a");

  const selectedBodyText = () =>
    bodies.evaluateAll((frames) =>
      frames
        .map(
          (frame) =>
            (frame as HTMLIFrameElement).contentDocument
              ?.getSelection()
              ?.toString() ?? "",
        )
        .join("\n"),
    );
  await expect.poll(selectedBodyText).toContain("Earlier message body.");
  await expect.poll(selectedBodyText).toContain("Later message body.");
  await capturePlaywrightCheckpoint(page, testInfo, "thread-selected");

  await page.evaluate(() => {
    window.addEventListener("copy", (event) => {
      document.body.dataset.copiedText =
        event.clipboardData?.getData("text/plain") ?? "";
    });
  });
  await page.keyboard.press("ControlOrMeta+c");

  const copiedText = () =>
    page.evaluate(() => document.body.dataset.copiedText ?? "");
  await expect.poll(copiedText).toContain("Later message body.");
  const copied = await copiedText();
  expect(copied).toContain("Matched Reason Message");
  expect(copied.indexOf("Earlier message body.")).toBeGreaterThan(-1);
  expect(copied.indexOf("Later message body.")).toBeGreaterThan(
    copied.indexOf("Earlier message body."),
  );
});
