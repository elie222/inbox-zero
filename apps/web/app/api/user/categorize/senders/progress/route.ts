import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getCategorizationProgress } from "@/utils/redis/categorization-progress";
import { withError } from "@/utils/middleware";

export type CategorizeProgress = Awaited<
  ReturnType<typeof getCategorizeProgress>
>;

async function getCategorizeProgress({ email }: { email: string }) {
  const progress = await getCategorizationProgress({ email });
  return progress;
}

export const GET = withError(async () => {
  const session = await auth();
  const email = session?.user.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" });

  const result = await getCategorizeProgress({ email });
  return NextResponse.json(result);
});
