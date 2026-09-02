import { expect, type Locator } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  expectVisibleAfterTransientFetch,
  markAutomationOnboardingViewed,
} from "./automation-tabs-test-helpers";

const RULE_NAME = "Playwright Todoist rule";
const INTEGRATION_ID = "playwright-mcp-todoist";

let emailAccountIdForCleanup: string | undefined;

test.afterEach(async () => {
  await cleanupTodoistState(emailAccountIdForCleanup);
  emailAccountIdForCleanup = undefined;
});

test("configures and persists a Todoist rule action", async ({ page }) => {
  test.setTimeout(360_000);
  const emailAccountId = await getEmailAccountId(page);
  emailAccountIdForCleanup = emailAccountId;
  await setupTodoistState(emailAccountId);
  await markAutomationOnboardingViewed(page);

  await page.goto(`/${emailAccountId}/automation`);
  await expectVisibleAfterTransientFetch(
    page,
    page.getByRole("heading", { name: "AI Assistant", exact: true }),
  );
  const integrationsResponse = await page.request.get("/api/mcp/integrations", {
    headers: { "x-email-account-id": emailAccountId },
  });
  expect(integrationsResponse.ok()).toBe(true);

  const addRuleManually = page.getByRole("button", {
    name: "Add rule manually",
  });
  await expect(async () => {
    if (await addRuleManually.isVisible()) return;
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(addRuleManually).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 30_000 });
  await addRuleManually.click();

  const createDialog = page.getByRole("dialog", { name: "Create Rule" });
  await expect(createDialog).toBeVisible();
  await createDialog
    .getByPlaceholder(
      "e.g. Newsletters, regular content from publications, blogs, or services I've subscribed to",
    )
    .fill("Emails that contain a task I need to complete");
  await createDialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Add Todoist task" }).click();

  const taskField = createDialog.getByPlaceholder(
    "AI writes a short action item from the email",
  );
  const descriptionField = createDialog.getByPlaceholder(
    "AI writes one line of context",
  );
  await expect(taskField).toBeVisible({ timeout: 60_000 });
  await taskField.fill("Review the request");
  await descriptionField.fill("Check the email and decide on next steps");

  const projectSelect = getLabeledSelect(createDialog, "Project");
  await projectSelect.click();
  await page.getByRole("option", { name: "Work", exact: true }).click();
  const dueDateSelect = getLabeledSelect(createDialog, "Due date");
  await dueDateSelect.click();
  await page.getByRole("option", { name: "Tomorrow", exact: true }).click();

  await createDialog
    .getByRole("textbox", { name: "Rule name" })
    .fill(RULE_NAME);
  await createDialog.getByRole("button", { name: "Create" }).click();
  await expect
    .poll(() => getTodoistRuleState(emailAccountId), { timeout: 120_000 })
    .toMatchObject({
      integrationArgs: {
        content: "Review the request",
        description: "Check the email and decide on next steps",
        dueString: "tomorrow",
        projectId: "6X7rM8997g3RQmvh",
        projectName: "Work",
      },
      integrationName: "todoist",
      integrationToolName: "add-tasks",
      name: RULE_NAME,
      type: "INTEGRATION",
    });

  await page.reload();
  const ruleRow = page.getByRole("row").filter({ hasText: RULE_NAME });
  await expect(ruleRow).toBeVisible({ timeout: 60_000 });
  await ruleRow.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("menuitem", { name: "Edit manually" }).click();

  const editDialog = page.getByRole("dialog", { name: "Edit Rule" });
  await expect(editDialog.getByRole("combobox").first()).toContainText(
    "Add Todoist task",
  );
  await expect(
    editDialog.getByPlaceholder("AI writes a short action item from the email"),
  ).toHaveValue("Review the request");
  await expect(getLabeledSelect(editDialog, "Project")).toContainText("Work");
  await expect(getLabeledSelect(editDialog, "Due date")).toContainText(
    "Tomorrow",
  );
});

function getLabeledSelect(dialog: Locator, label: string) {
  return dialog
    .getByText(label, { exact: true })
    .locator("..")
    .getByRole("combobox");
}

async function setupTodoistState(emailAccountId: string) {
  await cleanupTodoistState(emailAccountId);
  await withClient(async (client) => {
    const integrationResult = await client.query<{ id: string }>(
      `INSERT INTO "McpIntegration" (id, name, "createdAt", "updatedAt")
       VALUES ($1, 'todoist', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (name) DO UPDATE SET "updatedAt" = CURRENT_TIMESTAMP
       RETURNING id`,
      [INTEGRATION_ID],
    );
    const integrationId = integrationResult.rows[0]?.id;
    if (!integrationId) throw new Error("Could not seed Todoist integration");

    const connectionId = `${emailAccountId}-playwright-todoist`;
    await client.query(
      `INSERT INTO "McpConnection" (
         id, name, "isActive", "accessToken", "integrationId",
         "emailAccountId", "createdAt", "updatedAt"
       )
       VALUES ($1, 'Playwright Todoist', true, 'emulator-token', $2, $3,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [connectionId, integrationId, emailAccountId],
    );
    await client.query(
      `INSERT INTO "McpTool" (
         id, name, description, "isEnabled", "isWrite", "connectionId",
         "createdAt", "updatedAt"
       )
       VALUES ($1, 'add-tasks', 'Add Todoist tasks', true, true, $2,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [`${connectionId}-add-tasks`, connectionId],
    );
  });
}

async function cleanupTodoistState(emailAccountId?: string) {
  if (!emailAccountId) return;

  await withClient(async (client) => {
    await client.query(
      `DELETE FROM "Rule"
       WHERE "emailAccountId" = $1 AND name = $2`,
      [emailAccountId, RULE_NAME],
    );
    await client.query(
      `DELETE FROM "McpConnection"
       WHERE "emailAccountId" = $1
         AND "integrationId" = (
           SELECT id FROM "McpIntegration" WHERE name = 'todoist'
         )`,
      [emailAccountId],
    );
    await client.query(
      `DELETE FROM "McpIntegration"
       WHERE id = $1
         AND NOT EXISTS (
           SELECT 1 FROM "McpConnection" WHERE "integrationId" = $1
         )`,
      [INTEGRATION_ID],
    );
  });
}

async function getTodoistRuleState(emailAccountId: string) {
  return withClient(async (client) => {
    const result = await client.query<{
      integrationArgs: Record<string, string> | null;
      integrationName: string | null;
      integrationToolName: string | null;
      name: string;
      type: string;
    }>(
      `SELECT r.name,
              a.type::text,
              a."integrationName",
              a."integrationToolName",
              a."integrationArgs"
       FROM "Rule" r
       JOIN "Action" a ON a."ruleId" = r.id
       WHERE r."emailAccountId" = $1 AND r.name = $2`,
      [emailAccountId, RULE_NAME],
    );
    return result.rows[0];
  });
}

async function withClient<T>(callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}
