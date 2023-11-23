import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import {
  executePlan,
  executePlanBody,
} from "@/app/api/user/planned/[id]/controller";
import { getGmailClient } from "@/utils/gmail/client";

export const POST = withError(async (request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });
  if (!params.id) return NextResponse.json({ error: "Missing id" });

  const json = await request.json();
  const body = executePlanBody.parse(json);

  const gmail = getGmailClient(session);

  const result = await executePlan(
    {
      ...body,
      planId: params.id,
      userId: session.user.id,
      userEmail: session.user.email,
    },
    gmail,
  );

  return NextResponse.json({ success: true });
});
