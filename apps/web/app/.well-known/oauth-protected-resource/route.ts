import {
  getMcpProtectedResourceMetadata,
  isMcpServerAvailable,
} from "@/utils/mcp/config";

export async function GET() {
  if (!isMcpServerAvailable()) return new Response(null, { status: 404 });
  return Response.json(getMcpProtectedResourceMetadata());
}
