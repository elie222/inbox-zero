import { type NextRequest, NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { betterAuthConfig } from "@/utils/auth";
import { isMcpServerEnabledForUser } from "@/utils/mcp/access";

const authHandler = toNextJsHandler(betterAuthConfig);

export async function GET(request: NextRequest) {
  const accessResponse = await getMcpAccessResponse(request);
  if (accessResponse) {
    return accessResponse;
  }

  return authHandler.GET(request);
}

export async function POST(request: NextRequest) {
  return authHandler.POST(request);
}

async function getMcpAccessResponse(request: NextRequest) {
  if (!isMcpAuthorizePath(request.nextUrl.pathname)) {
    return null;
  }

  const session = await betterAuthConfig.api.getSession({
    headers: request.headers,
  });
  const userId = session?.user.id;

  if (!userId) {
    return null;
  }

  const isEnabled = await isMcpServerEnabledForUser(userId);
  if (isEnabled) {
    return null;
  }

  return NextResponse.json(
    { error: "MCP access is not enabled for this user." },
    { status: 403 },
  );
}

function isMcpAuthorizePath(pathname: string) {
  return pathname.endsWith("/mcp/authorize");
}
