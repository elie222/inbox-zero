import { NextResponse } from "next/server";
import { getLabels as getOutlookLabels } from "@/utils/outlook/label";
import { withEmailAccount } from "@/utils/middleware";
import { getOutlookClientForEmail } from "@/utils/account";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export type LabelsResponse = Awaited<ReturnType<typeof getLabels>>;

async function getLabels(client: any) {
  const labels = await getOutlookLabels(client);
  return { labels };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const outlook = await getOutlookClientForEmail({ emailAccountId });
  const labels = await getLabels(outlook);

  return NextResponse.json(labels);
});
