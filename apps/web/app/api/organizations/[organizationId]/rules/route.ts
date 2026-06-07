import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsAdmin } from "@/utils/organizations/access";

export type OrganizationRulesResponse = Awaited<
  ReturnType<typeof getOrganizationRules>
>;

async function getOrganizationRules({
  organizationId,
}: {
  organizationId: string;
}) {
  const [rules, memberCount] = await Promise.all([
    prisma.organizationRule.findMany({
      where: { organizationId },
      include: {
        actions: true,
        _count: {
          select: {
            memberRules: { where: { organizationRuleMemberEnabled: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.member.count({ where: { organizationId } }),
  ]);

  return { rules, memberCount };
}

export const GET = withAuth(
  "organizations/rules",
  async (request, { params }) => {
    const { userId } = request.auth;
    const { organizationId } = await params;

    await fetchAndCheckIsAdmin({ organizationId, userId });

    const result = await getOrganizationRules({ organizationId });

    return NextResponse.json(result);
  },
);
