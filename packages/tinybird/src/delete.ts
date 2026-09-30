import pRetry, { AbortError } from "p-retry";

// Datasources that store rows per mailbox, keyed by the mailbox address.
const EMAIL_DATASOURCES = [
  "email_action",
  "email",
  "last_and_oldest_emails_mv",
] as const;

// Deletes rows that identify a mailbox by its address. AI usage rows are kept
// for cost reporting; they are keyed by user id except when usage tracking
// fell back to the email address, and those rows are deleted too.
export async function deleteTinybirdEmailData(emails: string[]) {
  if (!process.env.TINYBIRD_TOKEN || !emails.length) return;

  const quotedEmails = emails.map(quote).join(", ");
  await deleteRows("aiCall", `userId IN (${quotedEmails})`);
  for (const datasource of EMAIL_DATASOURCES) {
    await deleteRows(datasource, `ownerEmail IN (${quotedEmails})`);
  }
}

// Tinybird runs one delete job at a time and answers 429 while one is running.
async function deleteRows(datasource: string, deleteCondition: string) {
  // The ingest token can only append, so deletes need a token with DATASOURCES:CREATE.
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
