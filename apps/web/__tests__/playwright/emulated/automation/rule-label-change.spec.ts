import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { cleanupTestRules, RULE_NAME } from "./automation-test-helpers";
import {
  expectVisibleAfterTransientFetch,
  markAutomationOnboardingViewed,
} from "./automation-tabs-test-helpers";

let emailAccountIdForCleanup: string | undefined;

test.afterEach(async () => {
  await cleanupTestRules(emailAccountIdForCleanup);
  emailAccountIdForCleanup = undefined;
});

test("changing a rule's label to a newly created one saves its name with its ID", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const emailAccountId = await getEmailAccountId(page);
  emailAccountIdForCleanup = emailAccountId;
  await cleanupTestRules(emailAccountId);
  await markAutomationOnboardingViewed(page);

  const labelsResponse = await page.request.get("/api/labels", {
    headers: { "X-Email-Account-ID": emailAccountId },
  });
  expect(labelsResponse.ok()).toBe(true);
  const { labels } = (await labelsResponse.json()) as {
    labels: { id: string; name: string; type?: string }[];
  };
  const original = labels.find(
    (label) => label.type === "user" && label.id && label.name,
  );
  if (!original)
    throw new Error("Emulated inbox has no user label to start from");
  const replacementName = `Playwright vendors ${Date.now()}`;

  await seedLabelRule({ emailAccountId, label: original });

  await page.goto(`/${emailAccountId}/automation`);
  await expectVisibleAfterTransientFetch(
    page,
    page.getByRole("heading", { name: "AI Assistant", exact: true }),
  );

  const ruleRow = page.getByRole("row").filter({ hasText: RULE_NAME });
  await expect(ruleRow).toBeVisible({ timeout: 60_000 });
  await ruleRow.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("menuitem", { name: "Edit manually" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit Rule" });

  await editDialog
    .getByRole("combobox")
    .filter({ hasText: original.name })
    .click();
  await page.getByPlaceholder("Search...").fill(replacementName);
  await page
    .getByRole("button", { name: `Create "${replacementName}" label` })
    .click();
  await expect(
    editDialog.getByRole("combobox").filter({ hasText: replacementName }),
  ).toBeVisible({ timeout: 30_000 });
  await editDialog.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(() => getLabelAction(emailAccountId), { timeout: 60_000 })
    .toMatchObject({ label: replacementName });
  const refreshedLabels = await page.request.get("/api/labels", {
    headers: { "X-Email-Account-ID": emailAccountId },
  });
  const replacement = (
    (await refreshedLabels.json()) as { labels: { id: string; name: string }[] }
  ).labels.find((label) => label.name === replacementName);
  expect(await getLabelAction(emailAccountId)).toEqual({
    labelId: replacement?.id,
    label: replacementName,
  });
});

async function seedLabelRule({
  emailAccountId,
  label,
}: {
  emailAccountId: string;
  label: { id: string; name: string };
}) {
  const ruleId = `pw-rule-${randomUUID()}`;
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO "Rule" (id, name, "emailAccountId", instructions, "updatedAt")
       VALUES ($1, $2, $3, $4, NOW())`,
      [ruleId, RULE_NAME, emailAccountId, "Receipts from software vendors"],
    );
    await client.query(
      `INSERT INTO "Action" (id, type, "ruleId", "emailAccountId", "labelId", label, "updatedAt")
       VALUES ($1, 'LABEL', $2, $3, $4, $5, NOW())`,
      [
        `pw-action-${randomUUID()}`,
        ruleId,
        emailAccountId,
        label.id,
        label.name,
      ],
    );
  });
}

async function getLabelAction(emailAccountId: string) {
  return withClient(async (client) => {
    const result = await client.query<{ labelId: string; label: string }>(
      `SELECT a."labelId", a.label
       FROM "Action" a
       JOIN "Rule" r ON r.id = a."ruleId"
       WHERE r."emailAccountId" = $1 AND r.name = $2 AND a.type = 'LABEL'`,
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
