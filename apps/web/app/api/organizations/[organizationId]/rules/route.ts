import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsAdmin } from "@/utils/organizations/access";

export type OrganizationRulesResponse = Awaited<
  ReturnType<typeof getOrganizationRules>
>;

export const GET = withAuth(
  "organizations/rules",
  async (request, { params }) => {
    const { userId } = request.auth;
    const { organizationId } = await params;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 },
      );
    }

    await fetchAndCheckIsAdmin({ organizationId, userId });

    const result = await getOrganizationRules({ organizationId });

    return NextResponse.json(result);
  },
);

async function getOrganizationRules({
  organizationId,
}: {
  organizationId: string;
}) {
  const rules = await prisma.organizationRule.findMany({
    where: { organizationId },
    include: {
      actions: true,
      teams: { select: { id: true, name: true } },
      _count: { select: { managedRules: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return { rules };
}
