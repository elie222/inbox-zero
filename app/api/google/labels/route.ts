import { google, Auth } from "googleapis";
import { NextResponse } from "next/server";
import { client } from "../client";

async function listLabels(auth: Auth.OAuth2Client) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels;
  if (!labels || labels.length === 0) {
    console.log("No labels found.");
    return;
  }
  console.log("Labels:");
  labels.forEach((label) => {
    console.log(`- ${label.name}`);
  });

  return labels;
}

export async function GET() {
  const labels = await listLabels(client);

  return NextResponse.json({ labels });
}
