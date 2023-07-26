import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import { act, actBody } from "@/app/api/ai/act/controller";
import { getGmailClient } from "@/utils/google";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = actBody.parse(json);

  const gmail = getGmailClient(session);

  const result = await act(body, gmail);

  return NextResponse.json(result || { action: "no_action" });
}
