import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import {
  sendEmail,
  sendEmailBody,
} from "@/app/api/google/messages/send/controller";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = sendEmailBody.parse(json);

  const result = await sendEmail(body);

  return NextResponse.json(result);
}
