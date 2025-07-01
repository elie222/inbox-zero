import { NextResponse } from "next/server";
import { getLabels as getOutlookLabels } from "@/utils/outlook/label";
import { withEmailAccount } from "@/utils/middleware";
import { getOutlookClientForEmail } from "@/utils/account";
import type {
  UnifiedLabel,
  LabelsResponse,
} from "@/app/api/google/labels/route";
import { OUTLOOK_COLOR_MAP } from "@/utils/outlook/label";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function getLabels(client: any): Promise<LabelsResponse> {
  const outlookLabels = await getOutlookLabels(client);

  const unifiedLabels: UnifiedLabel[] = (outlookLabels || []).map((label) => {
    let color: UnifiedLabel["color"] | undefined;

    if (label.color) {
      const backgroundColor =
        OUTLOOK_COLOR_MAP[label.color as keyof typeof OUTLOOK_COLOR_MAP] ||
        "#95A5A6";
      color = {
        backgroundColor,
        textColor: null,
      };
    }

    return {
      id: label.id || "",
      name: label.name || "",
      type: "user", // Outlook categories are always user-created
      color,
    };
  });

  return { labels: unifiedLabels };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const outlook = await getOutlookClientForEmail({ emailAccountId });
  const labels = await getLabels(outlook);

  return NextResponse.json(labels);
});
