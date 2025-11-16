"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { inviteMemberBody } from "@/utils/actions/invite-member.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";
import { sendOrganizationInvitation } from "@/utils/organizations/invitations";

export const inviteMemberAction = actionClientUser
  .metadata({ name: "inviteMember" })
  .inputSchema(inviteMemberBody)
  .action(
    async ({
      ctx: { userId },
      parsedInput: { email, role, organizationId },
    }) => {
      const inviterMember = await prisma.member.findFirst({
        where: { organizationId, emailAccount: { userId } },
        select: {
          organizationId: true,
          role: true,
          emailAccountId: true,
          emailAccount: { select: { name: true, email: true } },
        },
      });

      if (!inviterMember) {
        throw new SafeError("You are not a member of this organization.");
      }

      if (!hasOrganizationAdminRole(inviterMember.role)) {
        throw new SafeError(
          "Only organization owners or admins can invite members.",
        );
      }

      if (role === "owner" && inviterMember.role !== "owner") {
        throw new SafeError(
          "Only existing owners can assign the owner role to new members.",
        );
      }

      const existing = await prisma.invitation.findFirst({
        where: {
          organizationId: inviterMember.organizationId,
          email,
          status: "pending",
        },
        select: { id: true },
      });
      if (existing) {
        return;
      }

      const invitation = await prisma.invitation.create({
        data: {
          organizationId: inviterMember.organizationId,
          email,
          role,
          status: "pending",
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14), // 14 days
          inviterId: inviterMember.emailAccountId,
        },
        select: { id: true },
      });

      const org = await prisma.organization.findUnique({
        where: { id: inviterMember.organizationId },
        select: { name: true },
      });

      await sendOrganizationInvitation({
        email,
        organizationName: org?.name || "Your organization",
        inviterName:
          inviterMember.emailAccount.name || inviterMember.emailAccount.email,
        invitationId: invitation.id,
      });
    },
  );
