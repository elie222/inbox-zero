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
