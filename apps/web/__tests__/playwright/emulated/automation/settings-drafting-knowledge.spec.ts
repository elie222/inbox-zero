import { expect, test } from "@playwright/test";
import {
  type AutomationSettingsCleanup,
  cleanupAutomationSettings,
  expectVisibleAfterTransientFetch,
  getAutomationEmailAccountId,
  getAutomationSettingsCard,
  getAutomationSettingsState,
  getKnowledgeState,
  KNOWLEDGE_TITLE,
  markAutomationOnboardingViewed,
  seedAutomationSettings,
  UPDATED_KNOWLEDGE_TITLE,
} from "./automation-tabs-test-helpers";

const SERVER_ACTION_TIMEOUT_MS = 120_000;

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

  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get("/api/knowledge", {
            headers: { "X-Email-Account-ID": emailAccountId },
          });
          return response.ok();
        } catch {
          return false;
        }
      },
      { timeout: 60_000 },
    )
    .toBe(true);

  await page.goto(`/${emailAccountId}/automation?tab=settings`);
  const autoDraftItem = getAutomationSettingsCard(page, "Auto draft replies");
  const autoDraftSwitch = autoDraftItem.getByRole("switch");
  await expectVisibleAfterTransientFetch(page, autoDraftSwitch);
  await expect(autoDraftSwitch).not.toBeChecked();
  await autoDraftSwitch.click();
  await expect
    .poll(
      async () => {
        const state = await getAutomationSettingsState(emailAccountId);
        return state.draftActionTypes;
      },
      { timeout: SERVER_ACTION_TIMEOUT_MS },
    )
    .toContain("DRAFT_EMAIL");

  await page.reload();
  await expectVisibleAfterTransientFetch(page, autoDraftSwitch);
  await expect(autoDraftSwitch).toBeChecked();

  const knowledgeItem = getAutomationSettingsCard(page, "Draft knowledge base");
  const manageKnowledge = knowledgeItem.getByRole("button", { name: "Manage" });
  await expectVisibleAfterTransientFetch(page, manageKnowledge);
  await expect(manageKnowledge).toBeEnabled({ timeout: 60_000 });
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
    .poll(() => getKnowledgeState(emailAccountId), {
      timeout: SERVER_ACTION_TIMEOUT_MS,
    })
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
    .poll(() => getKnowledgeState(emailAccountId), {
      timeout: SERVER_ACTION_TIMEOUT_MS,
    })
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
    .poll(() => getKnowledgeState(emailAccountId), {
      timeout: SERVER_ACTION_TIMEOUT_MS,
    })
    .toBeUndefined();
  await expect(updatedRow).toHaveCount(0);
});
