import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsAdmin } from "@/utils/organizations/access";

export type OrganizationTeamsResponse = Awaited<
  ReturnType<typeof getOrganizationTeams>
>;

export const GET = withAuth(
  "organizations/teams",
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

    const result = await getOrganizationTeams({ organizationId });

    return NextResponse.json(result);
  },
);

async function getOrganizationTeams({
  organizationId,
}: {
  organizationId: string;
}) {
  const teams = await prisma.organizationTeam.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      _count: { select: { members: true, rules: true } },
    },
    orderBy: { name: "asc" },
  });

  return { teams };
}
