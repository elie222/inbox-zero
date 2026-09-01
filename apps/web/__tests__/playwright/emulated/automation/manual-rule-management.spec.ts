import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  cleanupTestRules,
  getRuleState,
  RULE_NAME,
  UPDATED_RULE_NAME,
} from "./automation-test-helpers";
import {
  expectVisibleAfterTransientFetch,
  markAutomationOnboardingViewed,
} from "./automation-tabs-test-helpers";

const SERVER_ACTION_TIMEOUT_MS = 120_000;

let emailAccountIdForCleanup: string | undefined;

test.afterEach(async () => {
  await cleanupTestRules(emailAccountIdForCleanup);
  emailAccountIdForCleanup = undefined;
});

test("creates, edits, toggles, and deletes a manual automation rule", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const emailAccountId = await getEmailAccountId(page);
  emailAccountIdForCleanup = emailAccountId;
  await cleanupTestRules(emailAccountId);
  await markAutomationOnboardingViewed(page);

  await page.goto(`/${emailAccountId}/automation`);
  await expectVisibleAfterTransientFetch(
    page,
    page.getByRole("heading", { name: "AI Assistant", exact: true }),
  );

  const createDialog = page.getByRole("dialog", { name: "Create Rule" });
  const addRuleManually = page.getByRole("button", {
    name: "Add rule manually",
  });
  await expect(async () => {
    if (await addRuleManually.isVisible()) return;
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(addRuleManually).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 30_000 });
  await addRuleManually.click();
  await expect(createDialog).toBeVisible();

  await createDialog
    .getByPlaceholder(
      "e.g. Newsletters, regular content from publications, blogs, or services I've subscribed to",
    )
    .fill("Receipts and invoices from software vendors");
  await createDialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Archive" }).click();
  await createDialog
    .getByRole("textbox", { name: "Rule name" })
    .fill(RULE_NAME);
  const createButton = createDialog.getByRole("button", { name: "Create" });
  await expect(createButton).toBeEnabled();
  await createButton.click();
  await expect
    .poll(() => getRuleState(emailAccountId), {
      timeout: SERVER_ACTION_TIMEOUT_MS,
    })
    .toMatchObject({
      enabled: true,
      instructions: "Receipts and invoices from software vendors",
      name: RULE_NAME,
      type: "ARCHIVE",
    });
  await page.reload();

  const ruleRow = page.getByRole("row").filter({ hasText: RULE_NAME });
  await expect(ruleRow).toBeVisible({ timeout: 60_000 });

  await ruleRow.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("menuitem", { name: "Edit manually" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit Rule" });
  await editDialog
    .getByRole("textbox", { name: "Rule name" })
    .fill(UPDATED_RULE_NAME);
  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => getRuleState(emailAccountId), { timeout: 60_000 })
    .toMatchObject({ name: UPDATED_RULE_NAME });
  await page.reload();

  const updatedRuleRow = page
    .getByRole("row")
    .filter({ hasText: UPDATED_RULE_NAME });
  await expect(updatedRuleRow).toBeVisible({ timeout: 60_000 });
  await updatedRuleRow.getByRole("switch").click();
  await expect(updatedRuleRow.getByRole("switch")).toHaveAttribute(
    "data-state",
    "unchecked",
  );
  await expect
    .poll(() => getRuleState(emailAccountId), { timeout: 60_000 })
    .toMatchObject({
      enabled: false,
      name: UPDATED_RULE_NAME,
    });

  page.once("dialog", (dialog) => dialog.accept());
  await updatedRuleRow.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("Rule deleted", { exact: true })).toBeVisible();
  await expect(updatedRuleRow).toHaveCount(0);
  await expect
    .poll(() => getRuleState(emailAccountId), { timeout: 60_000 })
    .toBeUndefined();
});
