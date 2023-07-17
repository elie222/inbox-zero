import { NextResponse } from "next/server";

// Google PubSub calls this endpoint each time a user recieves an email. We subscribe for updates via `api/google/watch`
export async function POST(request: Request) {
  const body = await request.json();

  const data = body.message.data;

  // data is base64url-encoded JSON
  const decodedData: { emailAddress: string; historyId: string } = JSON.parse(
    Buffer.from(data, "base64").toString().replace(/-/g, "+").replace(/_/g, "/")
  );

  // TODO do something with the data

  return NextResponse.json({ ok: true });
}
