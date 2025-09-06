import { type NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { checkOrgEmailAccountAccess } from "@/utils/organizations/access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ emailAccountId: string }> },
) {
  const { emailAccountId } = await params;

  return withAuth(async (req) => {
    const userId = req.auth.userId;

    const orgMemberAccess = await checkOrgEmailAccountAccess(
      userId,
      emailAccountId,
    );

    if (!orgMemberAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const member = await prisma.member.findFirst({
      where: {
        user: {
          emailAccounts: {
            some: {
              id: emailAccountId,
            },
          },
        },
      },
      select: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json({
      name: member.user.name,
      email: member.user.email,
    });
  });
}
