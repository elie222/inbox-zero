import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  type AutomationSettingsCleanup,
  cleanupAutomationSettings,
  getAutomationSettingsCard,
  getAutomationSettingsState,
  markAutomationOnboardingViewed,
  seedAutomationSettings,
} from "./automation-tabs-test-helpers";

let settingsCleanup: AutomationSettingsCleanup | undefined;

test.afterEach(async () => {
  if (settingsCleanup) await cleanupAutomationSettings(settingsCleanup);
  settingsCleanup = undefined;
});

test("persists personalization, drafting, and advanced settings", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const emailAccountId = await getEmailAccountId(page);
  settingsCleanup = {
    ...(await seedAutomationSettings(emailAccountId)),
    emailAccountId,
  };
  await markAutomationOnboardingViewed(page);

  await page.goto(`/${emailAccountId}/automation?tab=settings`);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveAttribute("data-selected", "true");

  for (const heading of [
    "Auto draft replies",
    "Draft confidence",
    "Writing style",
    "Personal instructions",
    "Email signature",
    "Draft knowledge base",
    "Learned patterns",
    "Sync to browser extension",
    "Multi-rule selection",
    "Include referral signature",
    "Allow hidden links in AI drafts",
    "Sensitive data protection",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible({
      timeout: 60_000,
    });
  }

  const personalInstructionsItem = getAutomationSettingsCard(
    page,
    "Personal instructions",
  );
  await personalInstructionsItem.getByRole("button", { name: "Edit" }).click();
  const personalInstructionsDialog = page.getByRole("dialog", {
    name: "Personal instructions",
  });
  await personalInstructionsDialog
    .getByRole("textbox")
    .fill("I lead product. Keep replies concise and surface customer risks.");
  await personalInstructionsDialog
    .getByRole("button", { name: "Save" })
    .click();
  await expect
    .poll(() => getAutomationSettingsState(emailAccountId), {
      timeout: 60_000,
    })
    .toMatchObject({
      about: "I lead product. Keep replies concise and surface customer risks.",
    });

  const draftConfidence = page.getByRole("combobox", {
    name: "Draft confidence",
  });
  await draftConfidence.click();
  await page.getByRole("option", { name: /High confidence/ }).click();
  await expect
    .poll(() => getAutomationSettingsState(emailAccountId), {
      timeout: 60_000,
    })
    .toMatchObject({ draftReplyConfidence: "HIGH_CONFIDENCE" });

  const multiRuleItem = getAutomationSettingsCard(page, "Multi-rule selection");
  await multiRuleItem.getByRole("switch").click();
  await expect
    .poll(() => getAutomationSettingsState(emailAccountId), {
      timeout: 60_000,
    })
    .toMatchObject({ multiRuleSelectionEnabled: true });

  const referralItem = getAutomationSettingsCard(
    page,
    "Include referral signature",
  );
  await referralItem.getByRole("switch").click();
  await expect
    .poll(() => getAutomationSettingsState(emailAccountId), {
      timeout: 60_000,
    })
    .toMatchObject({ includeReferralSignature: true });

  const hiddenLinksItem = getAutomationSettingsCard(
    page,
    "Allow hidden links in AI drafts",
  );
  await hiddenLinksItem.getByRole("switch").click();
  await expect
    .poll(() => getAutomationSettingsState(emailAccountId), {
      timeout: 60_000,
    })
    .toMatchObject({ allowHiddenAiDraftLinks: true });

  const sensitiveData = page.getByRole("combobox", {
    name: "Sensitive data protection",
  });
  await sensitiveData.click();
  await page.getByRole("option", { name: /Block/ }).click();
  await expect
    .poll(() => getAutomationSettingsState(emailAccountId), {
      timeout: 60_000,
    })
    .toMatchObject({ sensitiveDataPolicy: "BLOCK" });

  await page.reload();
  await expect(draftConfidence).toContainText("High confidence", {
    timeout: 60_000,
  });
  await expect(multiRuleItem.getByRole("switch")).toBeChecked();
  await expect(referralItem.getByRole("switch")).toBeChecked();
  await expect(hiddenLinksItem.getByRole("switch")).toBeChecked();
  await expect(sensitiveData).toContainText("Block");

  await personalInstructionsItem.getByRole("button", { name: "Edit" }).click();
  await expect(personalInstructionsDialog.getByRole("textbox")).toHaveValue(
    "I lead product. Keep replies concise and surface customer risks.",
  );
});
