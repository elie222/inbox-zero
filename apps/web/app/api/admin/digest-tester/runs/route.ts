import { NextResponse } from "next/server";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export const GET = withError(async (request) => {
  const session = await auth();
  if (!isAdmin({ email: session?.user.email })) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const emailAccountId = searchParams.get("emailAccountId");

  const runs = await prisma.digestTestRun.findMany({
    where: { emailAccountId: emailAccountId! },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      createdAt: true,
      emailCount: true,
      digestIds: true,
    },
  });

  return NextResponse.json({ runs });
});

export const dynamic = "force-dynamic";
