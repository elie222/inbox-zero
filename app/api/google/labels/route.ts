import { gmail_v1 } from "googleapis";
import { NextResponse } from "next/server";
import { getSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/google";
import { getGmailLabels } from "@/utils/label";

export const dynamic = "force-dynamic";

// const labelsQuery = z.object({});
// export type LabelsQuery = z.infer<typeof labelsQuery>;
export type LabelsResponse = Awaited<ReturnType<typeof getLabels>>;

async function getLabels(gmail: gmail_v1.Gmail) {
  const labels = await getGmailLabels(gmail);
  return { labels };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const labels = await getLabels(gmail);

  return NextResponse.json(labels);
}
