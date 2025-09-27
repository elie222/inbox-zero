import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { MCP_INTEGRATIONS } from "@/utils/mcp/integrations";

export type GetMcpRegistryResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAuth(async () => {
  return NextResponse.json(await getData());
});

async function getData() {
  return { integrations: MCP_INTEGRATIONS };
}
