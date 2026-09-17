import { withError } from "@/utils/middleware";
import {
  handleMcpOptionsRequest,
  handleMcpPostRequest,
  handleMcpUnsupportedMethod,
} from "@/utils/mcp/http";

export const POST = withError("mcp-server", async (request) =>
  handleMcpPostRequest(request, request.logger),
);

export const OPTIONS = withError("mcp-server", async () =>
  handleMcpOptionsRequest(),
);

export const GET = withError("mcp-server", async () =>
  handleMcpUnsupportedMethod(),
);
