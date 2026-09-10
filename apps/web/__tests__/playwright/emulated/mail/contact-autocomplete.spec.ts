import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

test("suggests contacts in every recipient field and reuses cached searches", async ({
  page,
}, testInfo) => {
  const queries: string[] = [];
  await page.route("**/api/user/contacts?*", async (route) => {
    const query =
      new URL(route.request().url()).searchParams.get("query") ?? "";
    queries.push(query);
    await route.fulfill({
      json: {
        contacts:
          query === "contact"
            ? [
                { name: "First Contact", emailAddress: "first@example.com" },
                { name: "Second Contact", emailAddress: "second@example.com" },
              ]
            : [],
      },
    });
  });
  await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  const to = dialog.getByRole("combobox", { name: "To", exact: true });
  await to.fill("contact");
  await expect(
    page.getByRole("option", { name: "First Contact" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "contact-suggestions");
  await to.press("ArrowDown");
  await to.press("ArrowUp");
  await to.press("Enter");
  await expect(
    dialog.getByRole("button", { name: "Remove first@example.com" }),
  ).toBeVisible();
  await expect(to).toHaveValue("");

  await to.fill("contact");
  await expect(
    page.getByRole("option", { name: "Second Contact" }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: "First Contact" })).toHaveCount(
    0,
  );
  await to.fill("unmatched");
  await expect(
    page.getByRole("option", { name: "Second Contact" }),
  ).toHaveCount(0);
  await to.fill("");

  await dialog.getByRole("button", { name: "Cc/Bcc" }).click();
  for (const name of ["Cc", "Bcc"]) {
    const field = dialog.getByRole("combobox", { name, exact: true });
    await field.fill("contact");
    await page.getByRole("option", { name: "Second Contact" }).click();
    await expect(field).toHaveValue("");
  }
  expect(queries.filter((query) => query === "contact")).toHaveLength(1);

  const bcc = dialog.getByRole("combobox", { name: "Bcc", exact: true });
  await bcc.fill("manual@example.com");
  await bcc.press("Enter");
  await expect(
    dialog.getByRole("button", { name: "Remove manual@example.com" }),
  ).toBeVisible();
});
