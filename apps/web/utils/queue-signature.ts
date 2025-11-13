import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { verifyWorkerSignatureAppRouter } from "./worker-signature";

export function verifyQueueSignatureAppRouter<
  TReq extends Request | NextRequest,
  TRes extends Response,
>(handler: (req: TReq) => Promise<TRes> | TRes) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const hasWorkerSig =
      request.headers.has("x-worker-signature") &&
      request.headers.has("x-worker-timestamp");

    const adapter = async (req: Request): Promise<Response> => {
      const result = await handler(req as TReq);
      return result as TRes as Response;
    };

    const response = hasWorkerSig
      ? await verifyWorkerSignatureAppRouter(adapter)(request)
      : await verifySignatureAppRouter(adapter)(request);

    return response instanceof NextResponse
      ? response
      : NextResponse.json(await response.json(), {
          status: response.status,
          headers: response.headers,
        });
  };
}
