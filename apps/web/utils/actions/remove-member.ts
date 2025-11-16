"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { removeMemberBody } from "@/utils/actions/remove-member.validation";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";

export const removeMemberAction = actionClient
  .metadata({ name: "removeMember" })
  .inputSchema(removeMemberBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { memberId } }) => {
    const callerEmailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { id: true },
    });
    if (!callerEmailAccount)
      throw new SafeError("Invalid email account context.");
    const targetMember = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        emailAccountId: true,
        organizationId: true,
        role: true,
      },
    });

    if (!targetMember) {
      throw new SafeError("Member not found.");
    }

    const callerMembership = await prisma.member.findFirst({
      where: {
        emailAccountId: callerEmailAccount.id,
        organizationId: targetMember.organizationId,
      },
      select: { role: true },
    });

    if (!callerMembership) {
      throw new SafeError("You are not a member of this organization.");
    }

    if (!hasOrganizationAdminRole(callerMembership.role)) {
      throw new SafeError(
        "Only organization owners or admins can remove members.",
      );
    }

    // Prevent self-removal
    if (targetMember.emailAccountId === callerEmailAccount.id) {
      throw new SafeError("You cannot remove yourself from the organization.");
    }

    if (targetMember.role === "owner" && callerMembership.role !== "owner") {
      throw new SafeError("Only owners can remove other owners.");
    }

    if (targetMember.role === "owner") {
      const ownerCount = await prisma.member.count({
        where: { organizationId: targetMember.organizationId, role: "owner" },
      });
      if (ownerCount === 1) {
        throw new SafeError(
          "Cannot remove the last remaining owner from the organization.",
        );
      }
    }

    await prisma.member.delete({ where: { id: memberId } });

    return { success: true, message: "Member removed successfully" };
  });
