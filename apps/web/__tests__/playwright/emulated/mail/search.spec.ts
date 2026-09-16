import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

for (const accountScope of ["single", "all"] as const) {
  test(`${accountScope}: searches the mailbox and clears back to the inbox`, async ({
    page,
  }) => {
    const { conversations, emailAccountId } = await openMail(page);
    if (accountScope === "all")
      await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    const options = conversations.getByRole("option");
    await expect(options.first()).toBeVisible();

    const matching = conversationWithSubject(
      page,
      conversations,
      "Archive Action Message",
    );
    const nonMatching = conversationWithSubject(
      page,
      conversations,
      "Keyboard Navigation Message",
    );
    await expect(matching).toBeVisible();
    await expect(nonMatching).toBeVisible();

    const searchInput = page.getByPlaceholder("Search mail");
    await searchInput.fill("Archive Action");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/[?&]q=/);
    expect(new URL(page.url()).searchParams.get("q")).toBe("Archive Action");
    await expect(matching).toBeVisible();
    await expect(nonMatching).toHaveCount(0);

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(matching).toBeVisible();
    await expect(nonMatching).toBeVisible();
  });

  test(`${accountScope}: slash focuses search and Command K opens commands`, async ({
    page,
  }) => {
    const { emailAccountId } = await openMail(page);
    if (accountScope === "all")
      await page.goto(`/${emailAccountId}/mail?accountScope=all`);
    const searchInput = page.getByPlaceholder("Search mail");
    await expect(searchInput).toBeVisible();
    await page.getByRole("listbox", { name: "Conversations" }).click();

    await page.keyboard.press("Slash");

    await expect(searchInput).toBeFocused();
    await page.keyboard.press(
      `${process.platform === "darwin" ? "Meta" : "Control"}+k`,
    );
    await expect(page.getByRole("dialog")).toBeVisible();
  });
}

test("advanced search composes Gmail operators and restores them", async ({
  page,
}, testInfo) => {
  await openMail(page);

  await page.getByRole("button", { name: "Show search options" }).click();
  const filters = page.getByRole("form", { name: "Search options" });
  await expect(filters).toBeVisible();
  await filters.getByLabel("From").fill("alice@example.com");
  await filters.getByLabel("Subject").fill("weekly report");
  await filters.getByLabel("Has attachment").click();
  await capturePlaywrightCheckpoint(filters, testInfo, "mail-advanced-search");
  await filters.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/[?&]q=/);
  expect(new URL(page.url()).searchParams.get("q")).toBe(
    'from:alice@example.com subject:"weekly report" has:attachment',
  );
  await expect(page.getByPlaceholder("Search mail")).toHaveValue(
    'from:alice@example.com subject:"weekly report" has:attachment',
  );

  await page.getByRole("button", { name: "Show search options" }).click();
  const restored = page.getByRole("form", { name: "Search options" });
  await expect(restored.getByLabel("From")).toHaveValue("alice@example.com");
  await expect(restored.getByLabel("Subject")).toHaveValue("weekly report");
  await expect(restored.getByLabel("Has attachment")).toBeChecked();
});

test("advanced search panel stays aligned with the search field", async ({
  page,
}) => {
  await openMail(page);

  // The modal popover hides the toolbar from the accessibility tree, so the
  // field has to be measured before it opens.
  const searchField = await page.getByRole("search").boundingBox();
  await page.getByRole("button", { name: "Show search options" }).click();
  await expect(
    page.getByRole("form", { name: "Search options" }),
  ).toBeVisible();
  if (!searchField) throw new Error("missing search field bounding box");
  // The popover animates into place; measure the settled alignment.
  await expect
    .poll(async () => {
      const panel = await page.getByRole("dialog").boundingBox();
      return panel
        ? Math.abs(panel.x - searchField.x)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(8);
});

test("advanced search still filters the mailbox by Has the words", async ({
  page,
}) => {
  const { conversations } = await openMail(page);
  const matching = conversationWithSubject(
    page,
    conversations,
    "Archive Action Message",
  );
  const nonMatching = conversationWithSubject(
    page,
    conversations,
    "Keyboard Navigation Message",
  );
  await expect(matching).toBeVisible();
  await expect(nonMatching).toBeVisible();

  await page.getByRole("button", { name: "Show search options" }).click();
  const filters = page.getByRole("form", { name: "Search options" });
  await filters.getByLabel("Has the words").fill("Archive Action");
  await filters.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/[?&]q=/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("Archive Action");
  await expect(matching).toBeVisible();
  await expect(nonMatching).toHaveCount(0);
});

test("search suggests contacts and recent searches", async ({
  page,
}, testInfo) => {
  await page.route("**/api/user/contacts?*", async (route) => {
    const query =
      new URL(route.request().url()).searchParams.get("query") ?? "";
    await route.fulfill({
      json: {
        contacts: query.startsWith("ali")
          ? [{ name: "Alice Example", emailAddress: "alice@example.com" }]
          : [],
      },
    });
  });
  await openMail(page);

  const searchInput = page.getByPlaceholder("Search mail");
  // The forms plugin sizes untyped inputs at 1rem; the field must stay on the
  // toolbar's 14px ramp.
  await expect(searchInput).toHaveCSS("font-size", "14px");
  await searchInput.fill("ali");
  const suggestions = page.getByRole("listbox", { name: "Search suggestions" });
  await expect(
    suggestions.getByRole("option", { name: /Alice Example/ }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-search-suggestions");

  await searchInput.press("ArrowDown");
  await searchInput.press("Enter");
  await expect(page).toHaveURL(/[?&]q=/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("alice@example.com");
  await expect(suggestions).toHaveCount(0);

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await searchInput.click();
  const recent = suggestions.getByRole("option", {
    name: "alice@example.com",
  });
  await expect(recent).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-search-recent");

  await searchInput.press("Escape");
  await expect(suggestions).toHaveCount(0);
  await expect(searchInput).toBeFocused();

  await searchInput.fill("exa");
  await recent.click();
  expect(new URL(page.url()).searchParams.get("q")).toBe("alice@example.com");
});
