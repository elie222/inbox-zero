import { betterAuthConfig, ssoPlugin } from "@/utils/auth";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { providerId: string } },
) {
  try {
    const { providerId } = params;
    const url = new URL(request.url);

    console.log("Manual SSO callback for provider:", providerId);
    console.log(
      "Callback query params:",
      Object.fromEntries(url.searchParams.entries()),
    );

    // Use the main auth config's API to handle the SSO callback
    const result = await betterAuthConfig.api.callbackSSO({
      query: Object.fromEntries(url.searchParams.entries()),
      headers: request.headers,
      params: { providerId },
    });

    // The callback should redirect, so we return the result
    return result;
  } catch (error) {
    console.error("Manual SSO callback error:", error);
    return NextResponse.json({ error: "SSO callback failed" }, { status: 500 });
  }
}
