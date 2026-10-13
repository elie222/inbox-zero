import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccount } from "../account-test-helpers";

test("iCloud setup keeps credentials private and shows exact server folder paths", async ({
  page,
}, testInfo) => {
  await page.goto("/accounts/icloud");
  await expect(
    page.getByRole("heading", { name: "Connect iCloud Mail" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("App-specific password", { exact: true }),
  ).toHaveAttribute("type", "password");
  await expect(
    page.getByRole("button", { name: "Connect iCloud", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("icloud-connect-desktop.png"),
    fullPage: true,
  });
  const account = await getEmailAccount(page);
  await page.route("**/api/icloud/folders", (route) =>
    route.fulfill({
      json: {
        folders: [
          { path: "INBOX" },
          { path: "Receipts / Personal" },
          { path: "Archiv/保管" },
        ],
        mapping: { inbox: "INBOX", archive: "Archiv/保管" },
      },
    }),
  );
  await page.goto(`/accounts/icloud?account=${account.id}`);
  await expect(page.getByLabel("archive", { exact: true })).toHaveValue(
    "Archiv/保管",
  );
  await expect(page.getByLabel("trash", { exact: true })).toHaveValue("");
  await page
    .getByLabel("archive", { exact: true })
    .selectOption("Receipts / Personal");
  await expect(page.getByLabel("archive", { exact: true })).toHaveValue(
    "Receipts / Personal",
  );
  await page.screenshot({
    path: testInfo.outputPath("icloud-folders-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("icloud-folders-mobile.png"),
    fullPage: true,
  });
});
