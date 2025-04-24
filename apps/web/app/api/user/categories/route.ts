import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getUserCategories } from "@/utils/category.server";

export type UserCategoriesResponse = Awaited<ReturnType<typeof getCategories>>;

async function getCategories({ email }: { email: string }) {
  const result = await getUserCategories({ email });
  return { result };
}

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;
  const result = await getCategories({ email });
  return NextResponse.json(result);
});
