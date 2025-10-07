import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const debugInfo = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET
      ? "***SET***"
      : "***MISSING***",
    redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/google`,
    headers: {
      host: request.headers.get("host"),
      userAgent: request.headers.get("user-agent"),
      referer: request.headers.get("referer"),
    },
    url: request.url,
    searchParams: Object.fromEntries(request.nextUrl.searchParams),
  };

  // Generate OAuth URL for testing
  const scopes = [
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.settings.basic",
    "https://www.googleapis.com/auth/contacts",
  ];

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID || "");
  authUrl.searchParams.set("redirect_uri", debugInfo.redirectUri);
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  const debugInfoWithAuthUrl = {
    ...debugInfo,
    authUrl: authUrl.toString(),
  };

  return NextResponse.json(
    {
      debug: debugInfoWithAuthUrl,
      testAuthUrl: authUrl.toString(),
      instructions: {
        step1: "Copy the testAuthUrl and open it in your browser",
        step2: "Complete the OAuth flow",
        step3: "Check if you get the same error",
        step4: "If successful, copy the authorization code",
        step5:
          "Use /api/debug-oauth/test?code=YOUR_CODE to test token exchange",
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Authorization code is required" },
        { status: 400 },
      );
    }

    // Test token exchange
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        code: code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/google`,
      }),
    });

    const tokenData = await tokenResponse.json();

    return NextResponse.json({
      success: tokenResponse.ok,
      status: tokenResponse.status,
      tokenData,
      debug: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/google`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Token exchange failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
