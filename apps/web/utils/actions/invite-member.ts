"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { inviteMemberBody } from "@/utils/actions/invite-member.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";
import { sendOrganizationInvitation } from "@/utils/organizations/invitations";

export const inviteMemberAction = actionClient
  .metadata({ name: "inviteMember" })
  .schema(inviteMemberBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { email, role } }) => {
    const inviterEmailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { id: true, name: true, email: true },
    });
    if (!inviterEmailAccount)
      throw new SafeError("Invalid email account context.");

    const userMembership = await prisma.member.findFirst({
      where: { emailAccountId },
      select: { organizationId: true, role: true },
    });

    if (!userMembership) {
      throw new SafeError("You are not a member of any organization.");
    }

    if (!hasOrganizationAdminRole(userMembership.role)) {
      throw new SafeError(
        "Only organization owners or admins can invite members.",
      );
    }

    if (role === "owner" && userMembership.role !== "owner") {
      throw new SafeError(
        "Only existing owners can assign the owner role to new members.",
      );
    }

    const existing = await prisma.invitation.findFirst({
      where: {
        organizationId: userMembership.organizationId,
        email: email.trim(),
        status: "pending",
      },
      select: { id: true },
    });
    if (existing) {
      return;
    }

    const invitation = await prisma.invitation.create({
      data: {
        organizationId: userMembership.organizationId,
        email: email.trim(),
        role,
        status: "pending",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14), // 14 days
        inviterId: emailAccountId,
      },
      select: { id: true },
    });

    const org = await prisma.organization.findUnique({
      where: { id: userMembership.organizationId },
      select: { name: true },
    });

    await sendOrganizationInvitation({
      email,
      organizationName: org?.name || "Your organization",
      inviterName: inviterEmailAccount.name || inviterEmailAccount.email,
      invitationId: invitation.id,
    });
  });
