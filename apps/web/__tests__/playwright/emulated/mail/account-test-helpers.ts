import { randomUUID } from "node:crypto";
import { Client } from "pg";

export async function createSecondEmailAccount(
  primaryEmailAccountId: string,
  { signature }: { signature?: string } = {},
) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const suffix = randomUUID();
  const accountId = `playwright-account-${suffix}`;
  const id = `playwright-email-account-${suffix}`;
  const email = `playwright-secondary-${suffix}@gmail.com`;
  const name = "Playwright Secondary";

  try {
    await client.query("BEGIN");
    const userResult = await client.query<{ userId: string }>(
      `SELECT "userId" FROM "EmailAccount" WHERE id = $1`,
      [primaryEmailAccountId],
    );
    const userId = userResult.rows[0]?.userId;
    if (!userId) throw new Error("Could not find the Playwright account user");

    await client.query(
      `INSERT INTO "Account"
        (id, "createdAt", "updatedAt", "userId", provider, type, "providerAccountId")
       VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, 'google', 'oidc', $3)`,
      [accountId, userId, `playwright-provider-${suffix}`],
    );
    await client.query(
      `INSERT INTO "EmailAccount"
        (id, email, name, signature, "createdAt", "updatedAt", "userId", "accountId")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5, $6)`,
      [id, email, name, signature, userId, accountId],
    );
    await client.query("COMMIT");
    return { accountId, email, id, name };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export async function deleteSecondEmailAccount(accountId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DELETE FROM "Account" WHERE id = $1`, [accountId]);
  } finally {
    await client.end();
  }
}
