import type { gmail_v1 } from "@googleapis/gmail";
import { NextResponse } from "next/server";
import { getLabels as getGmailLabels } from "@/utils/gmail/label";
import { withEmailAccount } from "@/utils/middleware";
import { getGmailClientForEmail } from "@/utils/account";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// const labelsQuery = z.object({});
// export type LabelsQuery = z.infer<typeof labelsQuery>;
export type LabelsResponse = Awaited<ReturnType<typeof getLabels>>;

async function getLabels(gmail: gmail_v1.Gmail) {
  const labels = await getGmailLabels(gmail);
  return { labels };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const gmail = await getGmailClientForEmail({ emailAccountId });
  const labels = await getLabels(gmail);

  return NextResponse.json(labels);
});
