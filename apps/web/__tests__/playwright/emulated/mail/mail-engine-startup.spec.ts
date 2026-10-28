import { expect } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";

test("distinguishes missing OPFS from a startup failure", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "storage", { value: {} });
  });
  await page.goto(`/${emailAccountId}/mail`);
  await expect(
    page.getByText("This browser doesn’t support Mail", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-engine-unsupported");
});

test("retries engine startup after a worker load failure", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await page.addInitScript(() => {
    const BrowserWorker = window.Worker;
    let fail = true;
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: class extends BrowserWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (fail)
            throw new DOMException("Worker load blocked", "SecurityError");
          super(url, options);
        }
      },
    });
    window.addEventListener("mail-test-allow-worker", () => {
      fail = false;
    });
  });
  await page.goto(`/${emailAccountId}/mail`);
  await expect(
    page.getByText("Mail couldn’t start", { exact: true }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-engine-startup-failed",
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("mail-test-allow-worker")),
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("listbox", { name: "Conversations" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByText("Mail couldn’t start", { exact: true }),
  ).toHaveCount(0);
});
