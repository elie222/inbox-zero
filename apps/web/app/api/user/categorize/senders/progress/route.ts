import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getCategorizationProgress } from "@/utils/redis/categorization-progress";
import { withError } from "@/utils/middleware";

export type CategorizeProgress = Awaited<
  ReturnType<typeof getCategorizeProgress>
>;

async function getCategorizeProgress(userId: string) {
  const progress = await getCategorizationProgress({ userId });
  return progress;
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" });

  const result = await getCategorizeProgress(session.user.id);
  return NextResponse.json(result);
});
