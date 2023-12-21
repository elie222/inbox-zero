import { gmail_v1 } from "googleapis";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { getGmailLabels } from "@/utils/label";
import { withError } from "@/utils/middleware";

export const dynamic = "force-dynamic";

// const labelsQuery = z.object({});
// export type LabelsQuery = z.infer<typeof labelsQuery>;
export type LabelsResponse = Awaited<ReturnType<typeof getLabels>>;

async function getLabels(gmail: gmail_v1.Gmail) {
  const labels = await getGmailLabels(gmail);
  return { labels };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const labels = await getLabels(gmail);

  return NextResponse.json(labels);
});
