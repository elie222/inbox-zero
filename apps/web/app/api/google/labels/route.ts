import type { gmail_v1 } from "@googleapis/gmail";
import { NextResponse } from "next/server";
import { getLabels as getGmailLabels } from "@/utils/gmail/label";
import { withEmailAccount } from "@/utils/middleware";
import { getGmailClientForEmail } from "@/utils/account";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export type UnifiedLabel = {
  id: string;
  name: string;
  type: string | null;
  color?: {
    textColor?: string | null;
    backgroundColor?: string | null;
  };
  labelListVisibility?: string;
  messageListVisibility?: string;
};

export type LabelsResponse = {
  labels: UnifiedLabel[];
};

function isUserLabel(label: gmail_v1.Schema$Label): boolean {
  return label.type === "user";
}

async function getLabels(gmail: gmail_v1.Gmail): Promise<LabelsResponse> {
  const gmailLabels = await getGmailLabels(gmail);

  const unifiedLabels: UnifiedLabel[] = (gmailLabels || [])
    .filter((label) => isUserLabel(label))
    .map((label) => ({
      id: label.id || "",
      name: label.name || "",
      type: label.type || null,
      color: label.color || undefined,
      labelListVisibility: label.labelListVisibility || undefined,
      messageListVisibility: label.messageListVisibility || undefined,
    }));

  return { labels: unifiedLabels };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const gmail = await getGmailClientForEmail({ emailAccountId });
  const labels = await getLabels(gmail);

  return NextResponse.json(labels);
});
