import { NextResponse } from "next/server";
import { getSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/google";
import { watchEmails } from "./controller";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);

  const expirationDate = await watchEmails(session.user.id, gmail);
  if (expirationDate) {
    return NextResponse.json({ expirationDate });
  } else {
    console.error("Error watching inbox");
    return NextResponse.json({ error: "Error watching inbox" });
  }
}
