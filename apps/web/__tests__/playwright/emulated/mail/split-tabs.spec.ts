import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  cleanupDefaultSplitRule,
  conversationWithSubject,
  openMail,
  seedDefaultSplitRule,
} from "./mail-test-helpers";

let defaultSplitEmailAccountId: string | undefined;

test.afterEach(async () => {
  if (!defaultSplitEmailAccountId) return;
  await cleanupDefaultSplitRule(defaultSplitEmailAccountId);
  defaultSplitEmailAccountId = undefined;
});

test("moves focus with the active split when cycling by keyboard", async ({
  page,
}, testInfo) => {
  await openMail(page);

  await expect(page.getByTitle("Next split")).toHaveCount(0);

  const activeSplit = page.locator('button[aria-current="true"]');
  await expect(activeSplit).toBeVisible();
  await activeSplit.click();

  await page.keyboard.press("Tab");

  await expect(activeSplit).toBeFocused();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-split-keyboard-focus",
  );
});

test("shows a combined picker and creates a matching split", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);

  await page.getByRole("button", { name: "New split" }).click();

  const search = page.getByRole("combobox", {
    name: "Search labels and categories",
  });
  await expect(
    page.getByRole("option", { name: "Promotions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Project Alpha, not selected" }),
  ).toBeVisible();
  await expect(page.getByText(/Compiling/)).toBeHidden();
  // Keep Next's development indicator out of product screenshots.
  await page.locator("nextjs-portal").evaluateAll((portals) => {
    for (const portal of portals) portal.remove();
  });
  await capturePlaywrightCheckpoint(page, testInfo, "mail-new-split-initial");

  await page.getByRole("button", { name: "Describe a split instead" }).click();
  await expect(
    page.getByRole("textbox", { name: "Describe a split" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-new-split-description",
  );
  await page.getByRole("button", { name: "Back to the split list" }).click();

  await search.fill("Promotions");
  const promotionsOption = page.getByRole("option", {
    name: "Promotions",
    exact: true,
  });
  await expect(promotionsOption).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-new-split-existing-option",
  );

  await promotionsOption.click();
  const promotionsSplit = page.getByRole("button", {
    name: "Promotions",
    exact: true,
  });
  await expect(promotionsSplit).toBeVisible();

  await promotionsSplit.click();
  await expect(promotionsSplit).toHaveAttribute("aria-current", "true");
  await expect(
    conversationWithSubject(page, conversations, "Promotion Category Message"),
  ).toBeVisible();
  await expect(conversations.getByRole("option")).toHaveCount(1);
  await capturePlaywrightCheckpoint(page, testInfo, "mail-new-split-created");

  await page.getByRole("button", { name: "Manage splits" }).click();
  await page
    .getByRole("button", { name: "Remove the Promotions split" })
    .click();
  await expect(promotionsSplit).toHaveCount(0);
});

test("organizes split choices and manages all rule labels", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await seedDefaultSplitRule(emailAccountId);
  defaultSplitEmailAccountId = emailAccountId;
  await openMail(page);

  await page.getByRole("button", { name: "New split" }).click();

  await expect(page.getByText("State", { exact: true })).toHaveCount(0);
  const headingElements = page.locator("[cmdk-group-heading]");
  await expect(headingElements.filter({ hasText: /^Labels/ })).toBeVisible();
  await expect(
    headingElements.filter({ hasText: /^Categories$/ }),
  ).toBeVisible();
  const groupHeadings = await headingElements.allTextContents();
  expect(
    groupHeadings.findIndex((heading) => heading.startsWith("Labels")),
  ).toBeLessThan(
    groupHeadings.findIndex((heading) => heading.startsWith("Categories")),
  );

  // The bulk controls sit below the list rather than among the label rows.
  await expect(
    page.getByRole("option", { name: "Add a tab for each rule label" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add a tab for each rule label" })
    .click();
  const calendarSplit = page.getByRole("button", {
    name: "Calendar",
    exact: true,
  });
  await expect(calendarSplit).toBeVisible();
  await page.getByRole("button", { name: "New split" }).click();
  await expect(
    page.getByRole("button", { name: "Remove the rule label tabs" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-rule-label-splits-added",
  );

  await page
    .getByRole("button", { name: "Remove the rule label tabs" })
    .click();
  await expect(calendarSplit).toHaveCount(0);
});

test("builds one tab from several labels and names it", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const extraLabel = `Split Partner ${testInfo.retry}`;
  await page.getByRole("button", { name: "Create label" }).click();
  await page.getByRole("textbox", { name: "New label name" }).fill(extraLabel);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("link", { name: extraLabel, exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "New split" }).click();
  await page
    .getByRole("option", { name: "Project Alpha, not selected" })
    .click();
  await page
    .getByRole("option", { name: `${extraLabel}, not selected` })
    .click();
  // The tick is decorative, so the row's name has to carry the state.
  await expect(
    page.getByRole("option", { name: "Project Alpha, selected" }),
  ).toBeVisible();

  const name = page.getByRole("textbox", { name: "Tab name" });
  await expect(name).toHaveValue(`Project Alpha, ${extraLabel}`);
  await name.fill("Two labels");
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-new-split-multi-label",
  );
  await page.getByRole("button", { name: "Add tab for 2 labels" }).click();

  const split = page.getByRole("button", { name: "Two labels", exact: true });
  await expect(split).toHaveAttribute("aria-current", "true");
  // Both labels feed one tab, so mail carrying either one shows up in it.
  await expect(
    conversationWithSubject(page, conversations, "Project Label Message"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Manage splits" }).click();
  await page
    .getByRole("button", { name: "Remove the Two labels split" })
    .click();
  await expect(split).toHaveCount(0);
});

for (const accountScope of ["single", "all"] as const) {
  test(`${accountScope}: creates and removes splits without selecting them`, async ({
    page,
    request,
  }) => {
    const { emailAccountId } = await openMail(page);
    if (accountScope === "all") {
      await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    }
    await page.getByRole("button", { name: "New split" }).click();
    await page
      .getByRole("option", { name: "Project Alpha, not selected" })
      .click();
    await page.getByRole("button", { name: "Add tab", exact: true }).click();
    const split = page.getByRole("button", {
      name: "Project Alpha",
      exact: true,
    });
    await expect(split).toBeVisible();
    await page.getByRole("button", { name: "Manage splits" }).click();
    await page
      .getByRole("button", { name: "Remove the Project Alpha split" })
      .click();
    await expect(split).toHaveCount(0);

    for (const name of ["All", "Unread"] as const) {
      await page
        .getByRole("button", { name: `Remove the ${name} split` })
        .click();
      await expect
        .poll(async () => {
          const response = await request.get("/api/mail/settings", {
            headers: { "X-Email-Account-ID": emailAccountId },
          });
          return (await response.json()).splits.some(
            (split: { name: string }) => split.name === name,
          );
        })
        .toBe(false);
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
    }
    await page.reload();
    await expect(page.getByRole("button", { name: "New split" })).toBeVisible();
    for (const name of ["All", "Unread"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
      await page.getByRole("button", { name: "New split" }).click();
      await page.getByRole("option", { name, exact: true }).click();
      await expect
        .poll(async () => {
          const response = await request.get("/api/mail/settings", {
            headers: { "X-Email-Account-ID": emailAccountId },
          });
          return (await response.json()).splits.some(
            (split: { name: string }) => split.name === name,
          );
        })
        .toBe(true);
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
    await page.reload();
    await expect(
      page.getByRole("listbox", { name: "Conversations" }),
    ).toBeVisible();
    for (const name of ["All", "Unread"]) {
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
  });
}

test("keeps removal in the dialog and persists tab order", async ({
  page,
}, testInfo) => {
  await openMail(page);
  await expect(
    page.getByRole("button", { name: /Remove the .* split/ }),
  ).toHaveCount(0);
  const tabs = page.locator("button[data-split-tab]");
  const original = await tabs.allTextContents();
  expect(original.length).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Manage splits" }).click();
  const dialog = page.getByRole("dialog", { name: "Manage splits" });
  await dialog
    .getByRole("button", { name: `Move ${original[1]} up`, exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: `Move ${original[1]} up`, exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("list")).toHaveAttribute("aria-busy", "false");
  await capturePlaywrightCheckpoint(page, testInfo, "mail-manage-splits");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(tabs.first()).toHaveText(original[1]);
  await expect(tabs.filter({ hasText: original[0] })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await page.reload();
  await expect(tabs.first()).toHaveText(original[1]);
  await page.getByRole("button", { name: "Manage splits" }).click();
  const rows = dialog.getByRole("listitem");
  await rows.nth(1).locator("[data-drag-split]").dragTo(rows.first());
  await expect(dialog.getByRole("list")).toHaveAttribute("aria-busy", "false");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(tabs).toHaveText(original);
  await page.reload();
  await expect(tabs).toHaveText(original);
  await expect(
    page.getByRole("listbox", { name: "Conversations" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-splits-clean-tab-bar",
  );
});
