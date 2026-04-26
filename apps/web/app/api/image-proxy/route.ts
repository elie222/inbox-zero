import { createSafeImageProxyFetch } from "@inboxzero/image-proxy/node-safe-fetch";
import { handleImageProxyRequest } from "@inboxzero/image-proxy/proxy-service";
import { env } from "@/env";
import { withError, type RequestWithLogger } from "@/utils/middleware";

export const runtime = "nodejs";
export const maxDuration = 15;

export const GET = withError("image-proxy", async (request) =>
  handleProxyRequest(request),
);
export const HEAD = withError("image-proxy", async (request) =>
  handleProxyRequest(request),
);

async function handleProxyRequest(request: RequestWithLogger) {
  return handleImageProxyRequest(
    request,
    {
      allowUnsignedRequests: false,
      signingSecret: env.IMAGE_PROXY_SIGNING_SECRET,
    },
    {
      fetchImpl: createSafeImageProxyFetch as typeof fetch,
      logger: request.logger,
    },
  );
}
