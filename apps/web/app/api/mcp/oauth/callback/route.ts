import { type NextRequest, NextResponse } from "next/server";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("mcp/oauth/callback");

// Placeholder for future OAuth integrations (e.g., HubSpot)
export const GET = async (request: NextRequest) => {
  logger.warn("MCP OAuth callback not implemented yet", {
    search: request.nextUrl.search,
  });
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
};
