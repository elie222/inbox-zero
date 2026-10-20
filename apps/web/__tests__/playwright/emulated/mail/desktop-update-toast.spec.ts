import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

test("shows desktop update download progress and restarts when ready", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    let listener: ((status: unknown) => void) | undefined;
    Object.assign(window, {
      installUpdateCalls: 0,
      pushUpdateStatus: (status: unknown) => listener?.(status),
      inboxZeroDesktop: {
        startAuth: async () => {},
        onUpdateStatus: (next: (status: unknown) => void) => {
          listener = next;
          next(null);
          return () => {
            listener = undefined;
          };
        },
        installUpdate: async () => {
          (window as unknown as { installUpdateCalls: number })
            .installUpdateCalls++;
        },
      },
    });
  });
  await openMail(page);

  const pushUpdateStatus = (status: unknown) =>
    page.evaluate((value) => {
      (
        window as unknown as { pushUpdateStatus: (status: unknown) => void }
      ).pushUpdateStatus(value);
    }, status);

  await pushUpdateStatus({
    state: "downloading",
    version: "0.2.0",
    percent: 0,
  });
  await pushUpdateStatus({
    state: "downloading",
    version: "0.2.0",
    percent: 42,
  });
  const toast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Downloading Inbox Zero 0.2.0" });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole("progressbar")).toBeVisible();
  await expect(toast).toContainText("42%");
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "desktop-update-downloading",
  );

  await pushUpdateStatus({ state: "ready", version: "0.2.0" });
  const readyToast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Update ready" });
  await expect(readyToast).toContainText(
    "Restart Inbox Zero to finish updating to 0.2.0.",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "desktop-update-ready");

  await readyToast.getByRole("button", { name: "Restart" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { installUpdateCalls: number })
            .installUpdateCalls,
      ),
    )
    .toBe(1);
});
