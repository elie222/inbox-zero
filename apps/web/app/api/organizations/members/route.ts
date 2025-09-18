import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

export type OrganizationMembersResponse = Awaited<
  ReturnType<typeof getOrganizationMembers>
>;

async function getOrganizationMembers({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const userMembership = await prisma.member.findFirst({
    where: {
      emailAccountId,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      organizationId: true,
    },
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
      emailAccount: {
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

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getOrganizationMembers({ emailAccountId });
  return NextResponse.json(result);
});
