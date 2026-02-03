import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { withError } from "@/utils/middleware";
import { handleDigestRequest } from "./handle-digest";

export const POST = verifySignatureAppRouter(
  withError("digest", async (request) => {
    return handleDigestRequest(request);
  }),
);
