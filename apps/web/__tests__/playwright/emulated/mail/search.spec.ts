import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("searches the mailbox and clears back to the inbox", async ({ page }) => {
  const { conversations } = await openMail(page);
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
