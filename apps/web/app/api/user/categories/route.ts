import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getUserCategories } from "@/utils/category.server";

export type UserCategoriesResponse = Awaited<ReturnType<typeof getCategories>>;

async function getCategories({ email }: { email: string }) {
  const result = await getUserCategories({ email });
  return { result };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await getCategories({ email: session.user.email });

  return NextResponse.json(result);
});
