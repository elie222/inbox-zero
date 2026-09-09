import { expect } from "@playwright/test";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

for (const format of ["plain", "html", "styled-html"] as const) {
  test(`wraps long links in ${format} messages`, async ({ page }, testInfo) => {
    const url = `https://example.com/account?reference=${"abcdef0123456789".repeat(24)}`;
    await page.route(
      "**/api/threads/thr_playwright_reader?**",
      async (route) => {
        const response = await route.fetch();
        const body: ThreadResponse = await response.json();
        const message = body.thread.messages.at(-1);
        if (!message) throw new Error("Reader fixture has no messages");
        message.textPlain = `Account details:\n\n${url}\n\nEnd of message.`;
        message.textHtml = "";
        if (format !== "plain") {
          const style =
            format === "styled-html"
              ? ' style="font-family: Arial; font-size: 16px"'
              : "";
          message.textHtml = `<div${style}><p>Account details:</p><a href="${url}">${url}</a><p>End of message.</p></div>`;
        }
        await route.fulfill({ response, json: body });
      },
    );

    const { emailAccountId } = await openMail(page);
    await page.goto(`/${emailAccountId}/mail?thread-id=thr_playwright_reader`, {
      waitUntil: "domcontentloaded",
    });
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
