import { z } from "zod";
import { withError } from "@/utils/middleware";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { pollFastmailAccount } from "@/utils/fastmail/poll-sync";

const payload = z.object({ emailAccountId: z.string().min(1) });
export const maxDuration = 300;
export const POST = withError("fastmail/process", async (request) => {
  if (!isValidInternalApiKey(request.headers, request.logger))
    return new Response("Unauthorized", { status: 401 });
  const parsed = payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid payload", { status: 400 });
  const result = await pollFastmailAccount({
    ...parsed.data,
    logger: request.logger,
  });
  return Response.json(result, {
    status: result.status === "error" ? 503 : 200,
  });
});
