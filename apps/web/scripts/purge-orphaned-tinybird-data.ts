// Deletes Tinybird rows that identify mailboxes that no longer exist,
// left behind before account deletion cleaned up Tinybird.
//
// Run with TINYBIRD_DELETE_TOKEN set to a token that can also read the datasources
// (for example the workspace admin token).
// Dry run (counts only): `pnpm --filter inbox-zero-ai exec tsx scripts/purge-orphaned-tinybird-data.ts`
// Delete: `pnpm --filter inbox-zero-ai exec tsx scripts/purge-orphaned-tinybird-data.ts --apply`

import "dotenv/config";
import chunk from "lodash/chunk";
import { deleteTinybirdEmailData } from "@inboxzero/tinybird";
import prisma from "@/utils/prisma";

const BATCH_SIZE = 100;

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.TINYBIRD_TOKEN || !process.env.TINYBIRD_DELETE_TOKEN) {
    throw new Error("TINYBIRD_TOKEN and TINYBIRD_DELETE_TOKEN must be set");
  }

  const emailAccounts = await prisma.emailAccount.findMany({
    select: { email: true },
  });
  const liveEmails = new Set(
    emailAccounts.map(({ email }) => email.toLowerCase()),
  );

  const orphanedEmails = new Set<string>();
  const owners = await getDistinctValues("email_action", "ownerEmail");
  if (owners) {
    const orphaned = owners.filter(
      (email) => !liveEmails.has(email.toLowerCase()),
    );
    for (const email of orphaned) orphanedEmails.add(email);
    console.log(
      `email_action: ${owners.length} mailboxes, ${orphaned.length} orphaned`,
    );
  } else {
    console.log("email_action: datasource not found, skipping");
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
    headers: { Authorization: `Bearer ${process.env.TINYBIRD_DELETE_TOKEN}` },
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
