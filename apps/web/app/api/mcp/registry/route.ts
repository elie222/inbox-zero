import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { MCP_INTEGRATIONS } from "@inboxzero/mcp";

export const GET = withAuth(async () => {
  return NextResponse.json({ integrations: MCP_INTEGRATIONS });
});
