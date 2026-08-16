import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

const PLAYWRIGHT_TEST_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-test@gmail.com";

type PreviousOnboardingState = {
  completedOnboardingAt: Date | null;
  emailAccountId: string;
  onboardingAnswers: unknown;
  role: string | null;
  surveyCompanySize: number | null;
  surveyRole: string | null;
  surveySource: string | null;
  userId: string;
};

let previousState: PreviousOnboardingState | undefined;

export async function setupOnboardingTestState() {
  previousState = undefined;

  await withClient(async (client) => {
    const result = await client.query<PreviousOnboardingState>(
      `SELECT
         u.id AS "userId",
         ea.id AS "emailAccountId",
         u."completedOnboardingAt",
         u."onboardingAnswers",
         u."surveyRole",
         u."surveyCompanySize",
         u."surveySource",
         ea.role
       FROM "User" u
       INNER JOIN "EmailAccount" ea ON ea."userId" = u.id
       WHERE ea.email = $1`,
      [PLAYWRIGHT_TEST_EMAIL],
    );
    const candidateState = result.rows[0];
    if (!candidateState) {
      throw new Error("Could not find the Playwright onboarding account");
    }

    const rules = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM "Rule"
       WHERE "emailAccountId" = $1`,
      [candidateState.emailAccountId],
    );
    if (rules.rows[0]?.count !== 0) {
      throw new Error("The Playwright onboarding account must start fresh");
    }

    previousState = candidateState;
    await client.query(
      `UPDATE "User"
       SET "completedOnboardingAt" = NULL,
           "onboardingAnswers" = NULL,
           "surveyRole" = NULL,
           "surveyCompanySize" = NULL,
           "surveySource" = NULL
       WHERE id = $1`,
      [candidateState.userId],
    );
    await client.query(`UPDATE "EmailAccount" SET role = NULL WHERE id = $1`, [
      candidateState.emailAccountId,
    ]);
  });
}

export async function resetOnboardingTestState() {
  if (!previousState) return;
  const state = previousState;

  try {
    await withClient(async (client) => {
      await client.query(`DELETE FROM "Rule" WHERE "emailAccountId" = $1`, [
        state.emailAccountId,
      ]);
      await client.query(
        `UPDATE "User"
         SET "completedOnboardingAt" = $2,
             "onboardingAnswers" = $3,
             "surveyRole" = $4,
             "surveyCompanySize" = $5,
             "surveySource" = $6
         WHERE id = $1`,
        [
          state.userId,
          state.completedOnboardingAt,
          state.onboardingAnswers
            ? JSON.stringify(state.onboardingAnswers)
            : null,
          state.surveyRole,
          state.surveyCompanySize,
          state.surveySource,
        ],
      );
      await client.query(`UPDATE "EmailAccount" SET role = $2 WHERE id = $1`, [
        state.emailAccountId,
        state.role,
      ]);
    });
  } finally {
    previousState = undefined;
  }
}

export async function openControlOnboarding(page: Page) {
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/onboarding?step=who&variant=control`);
  await expect(
    page.getByRole("heading", { name: "What do you do?" }),
  ).toBeVisible({ timeout: 60_000 });
}

export async function getPersistedOnboardingState() {
  return withClient(async (client) => {
    const result = await client.query<{
      completed: boolean;
      draftRepliesEnabled: boolean;
      role: string | null;
      surveyCompanySize: number | null;
      surveyRole: string | null;
      surveySource: string | null;
      systemRuleCount: number;
    }>(
      `SELECT
         u."completedOnboardingAt" IS NOT NULL AS completed,
         ea.role,
         u."surveyRole",
         u."surveyCompanySize",
         u."surveySource",
         count(DISTINCT r.id)::int AS "systemRuleCount",
         coalesce(bool_or(
           r."systemType" = 'TO_REPLY'
           AND r.enabled
           AND a.type = 'DRAFT_EMAIL'
         ), false) AS "draftRepliesEnabled"
       FROM "User" u
       INNER JOIN "EmailAccount" ea ON ea."userId" = u.id
       LEFT JOIN "Rule" r ON r."emailAccountId" = ea.id
       LEFT JOIN "Action" a ON a."ruleId" = r.id
       WHERE ea.email = $1
       GROUP BY u.id, ea.id`,
      [PLAYWRIGHT_TEST_EMAIL],
    );
    return result.rows[0];
  });
}

async function getEmailAccountId(page: Page) {
  const response = await page.request.get("/api/user/email-accounts");
  expect(response.ok()).toBeTruthy();
  const { emailAccounts } = (await response.json()) as {
    emailAccounts: { id: string }[];
  };
  const emailAccountId = emailAccounts[0]?.id;
  if (!emailAccountId) throw new Error("The setup project created no account");
  return emailAccountId;
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
