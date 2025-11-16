"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { handleInvitationBody } from "@/utils/actions/invitation.validation";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

type PrismaInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
  inviterId: string;
};

async function getInvitation({
  emailAccountId,
  invitationId,
}: {
  emailAccountId: string;
  invitationId: string;
}): Promise<PrismaInvitation> {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation) {
    throw new SafeError("Invitation not found", 404);
  }

  if (invitation.status !== "pending" || invitation.expiresAt < new Date()) {
    throw new SafeError("Failed to retrieve invitation", 400);
  }

  const email = invitation.email.trim();

  const hasMatchingEmail = await prisma.emailAccount.findFirst({
    where: {
      id: emailAccountId,
      email: { equals: email, mode: "insensitive" },
    },
    select: { id: true },
  });

  if (!hasMatchingEmail) {
    throw new SafeError("You are not the recipient of the invitation", 400);
  }

  return invitation;
}

async function acceptInvitation({
  emailAccountId,
  invitationId,
}: {
  emailAccountId: string;
  invitationId: string;
}): Promise<{ organizationId: string; memberId: string }> {
  const invitation = await getInvitation({ emailAccountId, invitationId });

  const existingMembership = await prisma.member.findUnique({
    where: {
      organizationId_emailAccountId: {
        emailAccountId,
        organizationId: invitation.organizationId,
      },
    },
    select: { id: true },
  });

  if (existingMembership) {
    return {
      organizationId: invitation.organizationId,
      memberId: existingMembership.id,
    };
  }

  const createdMember = await prisma.member.create({
    data: {
      emailAccountId,
      organizationId: invitation.organizationId,
      role: invitation.role ?? "member",
    },
    select: { id: true },
  });

  await prisma.invitation.update({
    where: { id: invitationId },
    data: { status: "accepted" },
  });

  return {
    organizationId: invitation.organizationId,
    memberId: createdMember.id,
  };
}

export const handleInvitationAction = actionClientUser
  .metadata({ name: "handleInvitation" })
  .inputSchema(handleInvitationBody)
  .action(async ({ ctx: { userId }, parsedInput: { invitationId } }) => {
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new SafeError("Invitation not found", 404);
    }

    if (invitation.status !== "pending" || invitation.expiresAt < new Date()) {
      throw new SafeError("Failed to retrieve invitation", 400);
    }

    const emailAccount = await prisma.emailAccount.findFirst({
      where: {
        user: { id: userId },
        email: { equals: invitation.email.trim(), mode: "insensitive" },
      },
      select: { id: true },
    });

    if (!emailAccount) {
      throw new SafeError("You are not the recipient of the invitation", 400);
    }

    const emailAccountId = emailAccount.id;

    await acceptInvitation({ emailAccountId, invitationId });

    return { organizationId: invitation.organizationId };
  });
