import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

test("suggests contacts in every recipient field and reuses cached searches", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.NEXT_PUBLIC_CONTACTS_ENABLED === "false",
    "API contacts are disabled for this run",
  );
  const queries: string[] = [];
  let releaseSearch: () => void = () => {};
  const pendingSearch = new Promise<void>((resolve) => {
    releaseSearch = resolve;
  });
  await page.route("**/api/user/contacts?*", async (route) => {
    const query =
      new URL(route.request().url()).searchParams.get("query") ?? "";
    queries.push(query);
    if (query === "unmatched") await pendingSearch;
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
  const unmatchedRequest = page.waitForRequest((request) =>
    request.url().includes("/api/user/contacts?query=unmatched"),
  );
  await to.fill("unmatched");
  await unmatchedRequest;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect(
    page.getByRole("option", { name: "Second Contact" }),
  ).toHaveCount(0);
  releaseSearch();
  await to.fill("");

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

for (const theme of ["light", "dark"] as const) {
  test(`suggests cached mail contacts and selects them in ${theme} mode`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(
      (value) => localStorage.setItem("theme", value),
      theme,
    );
    let apiRequests = 0;
    await page.route("**/api/user/contacts?*", async (route) => {
      apiRequests++;
      await route.fulfill({ json: { contacts: [] } });
    });
    await openMail(page);
    await page.getByRole("button", { name: /^Compose/ }).click();
    const dialog = page.getByRole("dialog", { name: "New Message" });
    const to = dialog.getByRole("combobox", { name: "To", exact: true });
    await to.fill("ali");
    const alice = page.getByRole("option", {
      name: /Alice Example.*alice@example.com/,
    });
    await expect(alice).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      `${theme}-local-suggestions`,
    );
    const shotDirectory = process.env.CONTACT_SUGGESTIONS_SCREENSHOT_DIR;
    if (shotDirectory) {
      await mkdir(shotDirectory, { recursive: true });
      await page.screenshot({
        path: join(shotDirectory, `${theme}-1-suggestions.png`),
      });
    }
    await to.press("ArrowDown");
    await to.press("Enter");
    await expect(
      dialog.getByRole("button", { name: "Remove alice@example.com" }),
    ).toBeVisible();
    await expect(to).toHaveValue("");
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      `${theme}-local-selected`,
    );
    if (shotDirectory)
      await page.screenshot({
        path: join(shotDirectory, `${theme}-2-selected.png`),
      });
    for (const name of ["Cc", "Bcc"]) {
      const field = dialog.getByRole("combobox", { name, exact: true });
      await field.fill("bob");
      await page
        .getByRole("option", { name: /Bob Example.*bob@example.com/ })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Remove bob@example.com" }),
      ).toHaveCount(name === "Cc" ? 1 : 2);
    }
    await to.fill('"Doe, Jamie" <jamie@example.com>, sam@example.com');
    await to.press("Enter");
    await expect(
      dialog.getByRole("button", {
        name: 'Remove "Doe, Jamie" <jamie@example.com>',
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Remove sam@example.com" }),
    ).toBeVisible();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "pasted-recipients-selected",
    );
    if (process.env.NEXT_PUBLIC_CONTACTS_ENABLED === "false")
      expect(apiRequests).toBe(0);
  });
}
