import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { isMicrosoftPlaywright } from "../mail-provider";
import { openMail } from "./mail-test-helpers";

const OVERFLOW_THREADS = {
  plain: "thr_playwright_overflow_plain",
  html: "thr_playwright_overflow_html",
  "styled-html": "thr_playwright_overflow_styled",
} as const;

for (const format of ["plain", "html", "styled-html"] as const) {
  test(`wraps long links in ${format} messages`, async ({ page }, testInfo) => {
    test.skip(
      isMicrosoftPlaywright() && format === "plain",
      "Outlook paints body_content as HTML, so the plain-text <pre> wrap is Gmail-only.",
    );
    const url = `https://example.com/account?reference=${"abcdef0123456789".repeat(24)}`;
    const { emailAccountId } = await openMail(page);
    await page.goto(
      `/${emailAccountId}/mail?thread-id=${OVERFLOW_THREADS[format]}`,
      { waitUntil: "domcontentloaded" },
    );
    const message = page.locator("li[data-thread-message-id]").last();
    const content =
      format === "plain"
        ? message.locator("pre")
        : message.frameLocator("iframe").locator("body");
    await expect(
      content.getByRole("link", { name: url, exact: true }),
    ).toHaveAttribute("href", url);

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          content.evaluate(
            (element) => element.scrollWidth - element.clientWidth,
          ),
        )
        .toBeLessThanOrEqual(1);
      await expect
        .poll(() =>
          message.evaluate((element) => {
            let overflow = 0;
            for (
              let ancestor: HTMLElement | null = element;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              overflow = Math.max(
                overflow,
                ancestor.scrollWidth - ancestor.clientWidth,
              );
            }
            return overflow;
          }),
        )
        .toBeLessThanOrEqual(1);
      await capturePlaywrightCheckpoint(
        page,
        testInfo,
        `message-${format}-${width}`,
      );
    }
  });
}
