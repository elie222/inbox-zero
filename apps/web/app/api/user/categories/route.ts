import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getUserCategories } from "@/utils/category.server";

export type UserCategoriesResponse = Awaited<ReturnType<typeof getCategories>>;

async function getCategories({ userId }: { userId: string }) {
  const result = await getUserCategories(userId);
  return { result };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.id)
    return NextResponse.json({ error: "Not authenticated" });

  const result = await getCategories({ userId: session.user.id });

  return NextResponse.json(result);
});
