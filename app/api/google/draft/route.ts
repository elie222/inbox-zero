import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getAuthSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/google";
import { draftEmail, draftEmailBody } from "@/app/api/google/draft/controller";

export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = draftEmailBody.parse(json);

  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const draft = await draftEmail(body, gmail);

  return NextResponse.json(draft);
});
