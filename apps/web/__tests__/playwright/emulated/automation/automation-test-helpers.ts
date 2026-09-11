import { Client } from "pg";

export const RULE_NAME = "Playwright receipts";
export const UPDATED_RULE_NAME = "Playwright vendor receipts";

export async function cleanupTestRules(emailAccountId?: string) {
  if (!emailAccountId) return;

  await withClient(async (client) => {
    await client.query(
      `DELETE FROM "Rule"
       WHERE "emailAccountId" = $1 AND name IN ($2, $3)`,
      [emailAccountId, RULE_NAME, UPDATED_RULE_NAME],
    );
  });
}

export async function getRuleState(emailAccountId: string) {
  return withClient(async (client) => {
    const result = await client.query<{
      enabled: boolean;
      instructions: string | null;
      name: string;
      type: string;
    }>(
      `SELECT r.name, r.enabled, r.instructions, a.type::text
       FROM "Rule" r
       JOIN "Action" a ON a."ruleId" = r.id
       WHERE r."emailAccountId" = $1 AND r.name IN ($2, $3)
       ORDER BY a.id
       LIMIT 1`,
      [emailAccountId, RULE_NAME, UPDATED_RULE_NAME],
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
