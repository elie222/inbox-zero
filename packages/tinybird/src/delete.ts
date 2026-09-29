import pRetry, { AbortError } from "p-retry";

// Datasources that store rows per mailbox, keyed by the mailbox address.
const EMAIL_DATASOURCES = [
  "email_action",
  "email",
  "last_and_oldest_emails_mv",
] as const;

export async function deleteTinybirdData({
  userIds = [],
  emailAccountIds = [],
  emails = [],
}: {
  userIds?: string[];
  emailAccountIds?: string[];
  emails?: string[];
}) {
  if (!process.env.TINYBIRD_TOKEN) return;

  const aiCallConditions = [
    userIds.length ? `userId IN (${userIds.map(quote).join(", ")})` : null,
    emailAccountIds.length
      ? `emailAccountId IN (${emailAccountIds.map(quote).join(", ")})`
      : null,
  ].filter(Boolean);
  if (aiCallConditions.length) {
    await deleteRows("aiCall", aiCallConditions.join(" OR "));
  }

  if (emails.length) {
    const condition = `ownerEmail IN (${emails.map(quote).join(", ")})`;
    for (const datasource of EMAIL_DATASOURCES) {
      await deleteRows(datasource, condition);
    }
  }
}

// Tinybird runs one delete job at a time and answers 429 while one is running.
async function deleteRows(datasource: string, deleteCondition: string) {
  const token = process.env.TINYBIRD_DELETE_TOKEN;
  if (!token) {
    throw new Error(
      "TINYBIRD_DELETE_TOKEN is not set, so Tinybird data cannot be deleted",
    );
  }

  await pRetry(
    async () => {
      const response = await fetch(
        new URL(
          `/v0/datasources/${datasource}/delete`,
          process.env.TINYBIRD_BASE_URL || "https://api.us-east.tinybird.co/",
        ),
        {
          method: "POST",
          body: new URLSearchParams({ delete_condition: deleteCondition }),
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(30_000),
        },
      );

      if (response.ok) return;
      // The datasource does not exist in this workspace, so there is nothing to delete.
      if (response.status === 404) return;

      const error = new Error(
        `Unable to delete from Tinybird datasource ${datasource}: [${response.status}] ${await response.text()}`,
      );
      if (response.status === 429) throw error;
      throw new AbortError(error);
    },
    { retries: 6, factor: 2, minTimeout: 1000, maxTimeout: 15_000 },
  );
}

function quote(value: string) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
