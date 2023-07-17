import { Auth, google } from "googleapis";
import { NextResponse } from "next/server";
import { getSession } from "@/utils/auth";
import { getClient } from "@/utils/google";

export const dynamic = "force-dynamic";

// const labelsQuery = z.object({});
// export type LabelsQuery = z.infer<typeof labelsQuery>;
export type LabelsResponse = Awaited<ReturnType<typeof getLabels>>;

async function getLabels(auth: Auth.OAuth2Client) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels;

  return { labels };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });
  const auth = getClient(session);

  const labels = await getLabels(auth);

  return NextResponse.json(labels);
}
