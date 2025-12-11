import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { validateApiKeyAndGetEmailProvider } from "@/utils/api-auth";
import { getEmailAccountId } from "@/app/api/v1/helpers";
import { getStatsByPeriod } from "@/app/api/user/stats/by-period/controller";
import { statsByPeriodQuerySchema } from "./validation";

export const GET = withError(async (request) => {
  const { userId, accountId } =
    await validateApiKeyAndGetEmailProvider(request);

  const { searchParams } = new URL(request.url);
  const queryResult = statsByPeriodQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const { period, fromDate, toDate, email } = queryResult.data;

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

  const result = await getStatsByPeriod({
    period,
    fromDate,
    toDate,
    emailAccountId,
  });

  return NextResponse.json(result);
});
