import { google } from "googleapis";
import { NextResponse } from "next/server";
import { client } from "../client";

// const labelsQuery = z.object({});
// export type LabelsQuery = z.infer<typeof labelsQuery>;
export type LabelsResponse = Awaited<ReturnType<typeof getLabels>>;

async function getLabels() {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels;

  return { labels };
}

export async function GET() {
  const labels = await getLabels();

  return NextResponse.json(labels);
}
