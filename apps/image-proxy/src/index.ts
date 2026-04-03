import { handleImageProxyRequest } from "@inboxzero/image-proxy/proxy-service";

type Env = {
  IMAGE_PROXY_SIGNING_SECRET?: string;
};

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext) {
    const cache = await caches.open("image-proxy");

    return handleImageProxyRequest(
      request,
      { signingSecret: env.IMAGE_PROXY_SIGNING_SECRET },
      {
        cache,
        executionContext: ctx,
        logger: console,
      },
    );
  },
};
