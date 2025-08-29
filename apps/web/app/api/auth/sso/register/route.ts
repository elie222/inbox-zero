import { betterAuthConfig } from "@/utils/auth";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Use the main auth config's API instead of the plugin directly
    const result = await betterAuthConfig.api.registerSSOProvider({
      body,
      headers: request.headers,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("SSO provider registration error:", error);
    return NextResponse.json(
      { error: "SSO provider registration failed" },
      { status: 500 },
    );
  }
}
