import { expect, test } from "@playwright/test";
import {
  type AutomationSettingsCleanup,
  cleanupAutomationSettings,
  getAutomationEmailAccountId,
  getAutomationSettingsCard,
  getAutomationSettingsState,
  getKnowledgeState,
  KNOWLEDGE_TITLE,
  markAutomationOnboardingViewed,
  seedAutomationSettings,
  UPDATED_KNOWLEDGE_TITLE,
} from "./automation-tabs-test-helpers";

let settingsCleanup: AutomationSettingsCleanup | undefined;

test.afterEach(async () => {
  if (settingsCleanup) await cleanupAutomationSettings(settingsCleanup);
  settingsCleanup = undefined;
});

test("enables drafting and manages persisted draft knowledge", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const emailAccountId = await getAutomationEmailAccountId(page);
  settingsCleanup = {
    ...(await seedAutomationSettings(emailAccountId)),
    emailAccountId,
  };
  await markAutomationOnboardingViewed(page);

  const knowledgeResponse = await page.request.get("/api/knowledge", {
    headers: { "X-Email-Account-ID": emailAccountId },
  });
  expect(knowledgeResponse.ok()).toBeTruthy();

  await page.goto(`/${emailAccountId}/automation?tab=settings`);
  const autoDraftItem = getAutomationSettingsCard(page, "Auto draft replies");
  const autoDraftSwitch = autoDraftItem.getByRole("switch");
  await expect(autoDraftSwitch).not.toBeChecked({ timeout: 60_000 });
  await autoDraftSwitch.click();
  await expect
    .poll(
      async () => {
        const state = await getAutomationSettingsState(emailAccountId);
        return state.draftActionTypes;
      },
      { timeout: 60_000 },
    )
    .toContain("DRAFT_EMAIL");

  await page.reload();
  await expect(autoDraftSwitch).toBeChecked({ timeout: 60_000 });

  const knowledgeItem = getAutomationSettingsCard(page, "Draft knowledge base");
  const manageKnowledge = knowledgeItem.getByRole("button", { name: "Manage" });
  await expect(manageKnowledge).toBeEnabled();
  await manageKnowledge.click();

  const knowledgeDialog = page.getByRole("dialog", {
    name: "Draft knowledge base",
  });
  await expect(
    knowledgeDialog.getByText("No knowledge entries yet", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await knowledgeDialog.getByRole("button", { name: "Add" }).click();

  const addDialog = page.getByRole("dialog", { name: "Add Knowledge" });
  await addDialog.getByRole("textbox", { name: "Title" }).fill(KNOWLEDGE_TITLE);
  await addDialog
    .locator('[contenteditable="true"]')
    .fill("Customers use the product to reach inbox zero every morning.");
  await addDialog.getByRole("button", { name: "Create" }).click();
  await expect
    .poll(() => getKnowledgeState(emailAccountId), { timeout: 60_000 })
    .toEqual({
      content: "Customers use the product to reach inbox zero every morning.",
      title: KNOWLEDGE_TITLE,
    });

  const knowledgeRow = knowledgeDialog
    .getByRole("row")
    .filter({ hasText: KNOWLEDGE_TITLE });
  await expect(knowledgeRow).toBeVisible({ timeout: 60_000 });
  await knowledgeRow.getByRole("button", { name: "Edit" }).click();

  const editDialog = page.getByRole("dialog", { name: "Edit Knowledge" });
  await editDialog
    .getByRole("textbox", { name: "Title" })
    .fill(UPDATED_KNOWLEDGE_TITLE);
  await editDialog
    .locator('[contenteditable="true"]')
    .fill("Customers use the product to triage important email every morning.");
  await editDialog.getByRole("button", { name: "Update" }).click();
  await expect
    .poll(() => getKnowledgeState(emailAccountId), { timeout: 60_000 })
    .toEqual({
      content:
        "Customers use the product to triage important email every morning.",
      title: UPDATED_KNOWLEDGE_TITLE,
    });

  const updatedRow = knowledgeDialog
    .getByRole("row")
    .filter({ hasText: UPDATED_KNOWLEDGE_TITLE });
  await expect(updatedRow).toBeVisible({ timeout: 60_000 });
  await updatedRow.getByRole("button").last().click();
  const deleteDialog = page.getByRole("alertdialog", {
    name: "Delete Knowledge Base Entry",
  });
  await deleteDialog.getByRole("button", { name: "Delete" }).click();
  await expect
    .poll(() => getKnowledgeState(emailAccountId), { timeout: 60_000 })
    .toBeUndefined();
  await expect(updatedRow).toHaveCount(0);
});
