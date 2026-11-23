import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  conversationWithSubject,
  openMail,
  toggleMailLayout,
  withClient,
} from "./mail-test-helpers";

test("groups a sender's mail into one row that expands in place", async ({
  page,
}, testInfo) => {
  // Setup turns grouping off for the other specs; this is the default.
  const emailAccountId = await getEmailAccountId(page);
  await withClient((client) =>
    client.query(
      `UPDATE "EmailAccount" SET "mailGroupBySender" = true WHERE id = $1`,
      [emailAccountId],
    ),
  );
  const { conversations } = await openMail(page);
  const danaGroup = conversations
    .getByRole("option")
    .filter({ has: page.getByText("Dana Example", { exact: true }) });

  // The seeded Dana threads nobody replied to share one row; the ones the
  // account replied in keep their own.
  await expect(danaGroup).toHaveCount(1, { timeout: 60_000 });
  await expect(
    conversations.getByText("Dana Example, me", { exact: true }).first(),
  ).toBeVisible();
  await danaGroup.scrollIntoViewIfNeeded();
  await capturePlaywrightCheckpoint(page, testInfo, "sender-group-collapsed");

  await danaGroup.click();
  const collapse = conversations.getByRole("button", { name: /Collapse$/ });
  await expect(collapse).toContainText("Dana Example");
  await expect(
    conversationWithSubject(page, conversations, "Matched Reason Message"),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "sender-group-expanded");
  await collapse.click();
  await expect(danaGroup).toHaveCount(1);

  const viewOptions = page.getByRole("button", { name: "View options" });
  const toggle = page.getByRole("menuitemcheckbox", {
    name: "Group by sender",
  });
  await viewOptions.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(danaGroup).toHaveCount(3);
  await expect(
    conversationWithSubject(page, conversations, "Plain Text Links Message"),
  ).toBeVisible();

  await viewOptions.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(danaGroup).toHaveCount(1);

  // Grouping is the same on every tab, not only All.
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(
    conversationWithSubject(page, conversations, "Keyboard Navigation Message"),
  ).toBeVisible({ timeout: 60_000 });
  await expect(danaGroup).toHaveCount(1);
  await danaGroup.scrollIntoViewIfNeeded();
  await capturePlaywrightCheckpoint(page, testInfo, "sender-group-unread-tab");

  await page.emulateMedia({ colorScheme: "dark" });
  await toggleMailLayout(page);
  await expect(danaGroup).toHaveCount(1);
  await danaGroup.scrollIntoViewIfNeeded();
  await capturePlaywrightCheckpoint(page, testInfo, "sender-group-split-dark");
});
