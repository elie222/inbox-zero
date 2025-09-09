import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

export type OrganizationMembersResponse = Awaited<
  ReturnType<typeof getOrganizationMembers>
>;

async function getOrganizationMembers({ userId }: { userId: string }) {
  const userMembership = await prisma.member.findFirst({ 
    where: {
      userId
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      organizationId: true
    }
  });

  if (!userMembership) {
    throw new SafeError("You are not a member of any organization.");
  }

  const members = await prisma.member.findMany({
    where: {
      organizationId: userMembership.organizationId,
    },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return { members };
}

export const GET = withAuth(async (request) => {
  const { userId } = request.auth;

  const result = await getOrganizationMembers({ userId });
  return NextResponse.json(result);
});
