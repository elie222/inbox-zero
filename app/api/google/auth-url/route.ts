import { NextResponse } from "next/server";
import { SCOPES, client } from "../client";

export async function GET() {
  const url = client.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: "offline",
    scope: SCOPES,
  });

  return NextResponse.json({ url });
}
