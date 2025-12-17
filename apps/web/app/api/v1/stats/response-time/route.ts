import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { validateApiKeyAndGetEmailProvider } from "@/utils/api-auth";
import { getEmailAccountId } from "@/app/api/v1/helpers";
import { getResponseTimeStats } from "@/app/api/user/stats/response-time/controller";
import { responseTimeQuerySchema } from "./validation";

export const GET = withError("v1/stats/response-time", async (request) => {
  const { emailProvider, userId, accountId } =
    await validateApiKeyAndGetEmailProvider(request);

  const { searchParams } = new URL(request.url);
  const queryResult = responseTimeQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const { fromDate, toDate, email } = queryResult.data;

  const emailAccountId = await getEmailAccountId({
    email,
    accountId,
    userId,
  });

  if (!emailAccountId) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 400 },
    );
  }

  const result = await getResponseTimeStats({
    fromDate,
    toDate,
    emailAccountId,
    emailProvider,
    logger: request.logger,
  });

  return NextResponse.json(result);
});
