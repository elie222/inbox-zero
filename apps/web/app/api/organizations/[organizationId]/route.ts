import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { fetchAndCheckIsMember } from "@/utils/organizations/access";

export type OrganizationResponse = Awaited<ReturnType<typeof getOrganization>>;

export const GET = withAuth(
  "organizations/get",
  async (request, { params }) => {
    const { userId } = request.auth;
    const { organizationId } = await params;

    await fetchAndCheckIsMember({ organizationId, userId });

    const result = await getOrganization({ organizationId });

    return NextResponse.json(result);
  },
);

async function getOrganization({ organizationId }: { organizationId: string }) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });

  return organization;
}
