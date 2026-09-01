import type { Locator, Page, TestInfo } from "@playwright/test";

type ScreenshotTarget = Page | Locator;

export async function capturePlaywrightCheckpoint(
  target: ScreenshotTarget,
  testInfo: TestInfo,
  name: string,
) {
  const fileName = `${name.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}.png`;
  const screenshotPath = testInfo.outputPath(fileName);

  await target.screenshot({
    animations: "disabled",
    caret: "hide",
    path: screenshotPath,
  });
  await testInfo.attach(name, {
    contentType: "image/png",
    path: screenshotPath,
  });
}
