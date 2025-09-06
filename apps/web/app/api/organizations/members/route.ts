import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

export type OrganizationMembersResponse = Awaited<
  ReturnType<typeof getOrganizationMembers>
>;

async function getOrganizationMembers({ userId }: { userId: string }) {
  const userMembership = await prisma.member.findFirst({
    where: { userId },
    select: { organizationId: true },
  });

  if (!userMembership) {
    throw new SafeError("You are not a member of any organization.");
  }

  const members = await prisma.member.findMany({
    where: {
      organizationId: userMembership.organizationId,
      userId: { not: userId }, // Exclude the current user
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
          emailAccounts: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  // An user can have multiple email accounts,
  // but we should only show the account that matches the user's email
  const transformedMembers = members.map((member) => ({
    ...member,
    user: {
      ...member.user,
      emailAccounts: member.user.emailAccounts.filter(
        (ea) => ea.email === member.user.email,
      ),
    },
  }));

  return { members: transformedMembers };
}

export const GET = withAuth(async (request) => {
  const { userId } = request.auth;

  const result = await getOrganizationMembers({ userId });
  return NextResponse.json(result);
});
