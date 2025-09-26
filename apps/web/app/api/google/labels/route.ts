import type { gmail_v1 } from "@googleapis/gmail";
import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";

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

async function getLabels(
  emailProvider: EmailProvider,
): Promise<LabelsResponse> {
  const labels = await emailProvider.getLabels();

  const unifiedLabels: UnifiedLabel[] = (labels || []).filter((label) =>
    isUserLabel(label),
  );

  return { labels: unifiedLabels };
}

export const GET = withEmailProvider(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const provider = request.emailProvider.name;

  const emailProvider = await createEmailProvider({ emailAccountId, provider });

  const labels = await getLabels(emailProvider);

  return NextResponse.json(labels);
});
