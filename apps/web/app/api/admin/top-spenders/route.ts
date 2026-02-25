import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getTopWeeklyUsageCosts } from "@/utils/redis/usage";
import { isAdmin } from "@/utils/admin";
import prisma from "@/utils/prisma";

export type GetAdminTopSpendersResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAuth("admin/top-spenders", async (request) => {
  const { userId } = request.auth;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!isAdmin({ email: user?.email })) {
    return NextResponse.json(
      { error: "Unauthorized", isKnownError: true },
      { status: 403 },
    );
  }

  const result = await getData();
  return NextResponse.json(result);
});

async function getData() {
  const topSpenders = await getTopWeeklyUsageCosts({ limit: 25 });
  return { topSpenders };
}
