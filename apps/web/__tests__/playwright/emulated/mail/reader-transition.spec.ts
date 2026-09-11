import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

test("never paints an empty reader when moving between loaded HTML threads", async ({
  page,
}, testInfo) => {
  await page.route("**/api/threads/*?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.thread?.messages) {
      for (const message of body.thread.messages) {
        message.textHtml = `<p>Navigation body for ${body.thread.id}</p>`;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ response, json: body });
  });
  const { conversations } = await openMail(page);
  await expect(conversations.getByRole("option").nth(1)).toBeVisible();
  await conversations.getByRole("option").first().click();
  const frames = page.locator('iframe[title="Email content preview"]:visible');
  await expect
    .poll(() => frames.last().evaluate((frame) => frame.clientHeight), {
      timeout: 60_000,
    })
    .toBeGreaterThan(1);

  await page.evaluate(() => {
    const samples: boolean[] = [];
    Object.assign(window, { readerPaintSamples: samples });
    const sample = () => {
      const readers = Array.from(
        document.querySelectorAll('[data-testid="thread-reader"]'),
      );
      const visibleBody = readers.some((reader) =>
        Array.from(reader.querySelectorAll("iframe")).some(
          (frame) =>
            frame.checkVisibility({ visibilityProperty: true }) &&
            frame.getBoundingClientRect().height > 1 &&
            Boolean(frame.contentDocument?.body?.textContent?.trim()),
        ),
      );
      samples.push(visibleBody);
      if (
        !(window as unknown as { stopReaderPaintSamples?: boolean })
          .stopReaderPaintSamples
      )
        requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const initialUrl = page.url();
  for (const key of ["j", "k", "j", "k"]) {
    await page.keyboard.press(key);
    if (key === "j") await expect(page).not.toHaveURL(initialUrl);
    else await expect(page).toHaveURL(initialUrl);
    const threadId = new URL(page.url()).searchParams.get("thread-id");
    await expect(
      page
        .frameLocator('iframe[title="Email content preview"]:visible')
        .last()
        .getByText(`Navigation body for ${threadId}`),
    ).toBeVisible();
  }
  await page.keyboard.press("j");
  await page.keyboard.press("k");
  await expect(page).toHaveURL(initialUrl);
  await expect(
    page
      .frameLocator('iframe[title="Email content preview"]:visible')
      .last()
      .getByText(
        `Navigation body for ${new URL(initialUrl).searchParams.get("thread-id")}`,
      ),
  ).toBeVisible();
  const samples = await page.evaluate(() => {
    Object.assign(window, { stopReaderPaintSamples: true });
    return (window as unknown as { readerPaintSamples: boolean[] })
      .readerPaintSamples;
  });
  await testInfo.attach("reader-navigation-frames", {
    body: JSON.stringify({
      frames: samples.length,
      blankFrames: samples.filter((visible) => !visible).length,
    }),
    contentType: "application/json",
  });
  expect(samples.length).toBeGreaterThan(4);
  expect(samples.filter((visible) => !visible)).toHaveLength(0);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "reader-navigation-without-blank-frames",
  );
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
