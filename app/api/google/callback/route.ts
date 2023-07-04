import { NextResponse } from "next/server";
import { client } from "@/app/api/google/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code)
    return NextResponse.error();

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  return NextResponse.redirect("http://localhost:3000/mail");
}
