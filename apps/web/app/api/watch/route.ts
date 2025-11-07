import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const emailAccountCount = await prisma.emailAccount.count({
    where: { userId },
  });

  if (emailAccountCount === 0) {
    return NextResponse.json(
      { message: "No email accounts found for this user." },
      { status: 404 },
    );
  }

  const results = await ensureEmailAccountsWatched({ userIds: [userId] });

  return NextResponse.json({ results });
});
