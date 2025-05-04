import { NextResponse } from "next/server";
import { getCategorizationProgress } from "@/utils/redis/categorization-progress";
import { withEmailAccount } from "@/utils/middleware";

export type CategorizeProgress = Awaited<
  ReturnType<typeof getCategorizeProgress>
>;

async function getCategorizeProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const progress = await getCategorizationProgress({ emailAccountId });
  return progress;
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getCategorizeProgress({ emailAccountId });
  return NextResponse.json(result);
});
