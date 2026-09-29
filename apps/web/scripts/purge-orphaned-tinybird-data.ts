// Deletes Tinybird rows that identify mailboxes that no longer exist,
// left behind before account deletion cleaned up Tinybird.
//
// TINYBIRD_TOKEN needs read and delete (DATASOURCES:CREATE) access to the datasources.
// Dry run (counts only): `pnpm --filter inbox-zero-ai exec tsx scripts/purge-orphaned-tinybird-data.ts`
// Delete: `pnpm --filter inbox-zero-ai exec tsx scripts/purge-orphaned-tinybird-data.ts --apply`

import "dotenv/config";
import chunk from "lodash/chunk";
import { deleteTinybirdEmailData } from "@inboxzero/tinybird";
import prisma from "@/utils/prisma";

const EMAIL_DATASOURCES = [
  "email_action",
  "email",
  "last_and_oldest_emails_mv",
];
const BATCH_SIZE = 100;

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.TINYBIRD_TOKEN) {
    throw new Error("TINYBIRD_TOKEN is not set");
  }

  const emailAccounts = await prisma.emailAccount.findMany({
    select: { email: true },
  });
  const liveEmails = new Set(
    emailAccounts.map(({ email }) => email.toLowerCase()),
  );

  const orphanedEmails = new Set<string>();
  for (const datasource of EMAIL_DATASOURCES) {
    const owners = await getDistinctValues(datasource, "ownerEmail");
    if (!owners) {
      console.log(`${datasource}: datasource not found, skipping`);
      continue;
    }
    const orphaned = owners.filter(
      (email) => !liveEmails.has(email.toLowerCase()),
    );
    for (const email of orphaned) orphanedEmails.add(email);
    console.log(
      `${datasource}: ${owners.length} mailboxes, ${orphaned.length} orphaned`,
    );
  }

  // AI usage rows are kept; only rows that fell back to an email address as
  // the user id identify a person.
  const aiCallUsers = await getDistinctValues("aiCall", "userId");
  const orphanedAiCallEmails =
    aiCallUsers?.filter(
      (value) => value.includes("@") && !liveEmails.has(value.toLowerCase()),
    ) ?? [];
  for (const email of orphanedAiCallEmails) orphanedEmails.add(email);
  console.log(
    aiCallUsers
      ? `aiCall: ${orphanedAiCallEmails.length} orphaned email-keyed users`
      : "aiCall: datasource not found, skipping",
  );

  if (!apply) {
    console.log("Dry run. Re-run with --apply to delete.");
    return;
  }

  for (const emails of chunk([...orphanedEmails], BATCH_SIZE)) {
    await deleteTinybirdEmailData(emails);
  }
  console.log("Delete jobs submitted.");
}

async function getDistinctValues(datasource: string, column: string) {
  const url = new URL(
    "/v0/sql",
    process.env.TINYBIRD_BASE_URL || "https://api.us-east.tinybird.co/",
  );
  url.searchParams.set(
    "q",
    `SELECT DISTINCT ${column} AS value FROM ${datasource} FORMAT JSON`,
  );

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.TINYBIRD_TOKEN}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Tinybird query on ${datasource} failed: [${response.status}] ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { data: { value: string }[] };
  return body.data.map(({ value }) => value);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
