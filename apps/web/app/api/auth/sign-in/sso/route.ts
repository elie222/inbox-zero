import { betterAuthConfig } from "@/utils/auth";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Manual SSO sign-in request:", body);

    // Convert relative callback URL to absolute URL
    const baseUrl = new URL(request.url).origin;
    const modifiedBody = {
      ...body,
      callbackURL: body.callbackURL
        ? `${baseUrl}${body.callbackURL}`
        : `${baseUrl}/welcome-redirect`,
    };

    console.log("Modified body with absolute callback URL:", modifiedBody);

    // Use the main auth config's API to handle the SSO request
    const result = await betterAuthConfig.api.signInSSO({
      body: modifiedBody,
      headers: request.headers,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Manual SSO sign-in error:", error);
    return NextResponse.json({ error: "SSO sign-in failed" }, { status: 500 });
  }
}
