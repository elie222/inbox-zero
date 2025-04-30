import type { EmailForAction } from "@/utils/ai/types";

// Work out with AI what the steps are to complete this task:
// [ ] - db schema for digest
// [ ] - Send email
// [ ] - Email template
// [ ] - Trigger send. Collect all pending emails
// [ ] - Setting to set time for digest

export async function addToDigest({
  emailAccountId,
  email,
}: {
  emailAccountId: string;
  email: EmailForAction;
}) {
  const summarisedEmail = await aiSummariseEmail({ email });
  await saveDigestItemToDatabase({ emailAccountId, summarisedEmail });
}

async function aiSummariseEmail({ email }: { email: EmailForAction }) {
  return "";
}

async function saveDigestItemToDatabase({
  emailAccountId,
  summarisedEmail,
}: {
  emailAccountId: string;
  summarisedEmail: string;
}) {}

export async function sendDigestEmail() {}
