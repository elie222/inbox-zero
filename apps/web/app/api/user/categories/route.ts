import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getUserCategories } from "@/utils/category.server";

export type UserCategoriesResponse = Awaited<ReturnType<typeof getCategories>>;

async function getCategories({ emailAccountId }: { emailAccountId: string }) {
  const result = await getUserCategories({ emailAccountId });
  return { result };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getCategories({ emailAccountId });
  return NextResponse.json(result);
});
