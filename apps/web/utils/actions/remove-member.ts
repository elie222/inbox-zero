"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { removeMemberBody } from "@/utils/actions/remove-member.validation";
import { betterAuthConfig } from "@/utils/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";

export const removeMemberAction = actionClientUser
  .metadata({ name: "removeMember" })
  .schema(removeMemberBody)
  .action(async ({ ctx: { userId }, parsedInput: { memberId } }) => {
    const targetMember = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, userId: true, organizationId: true, role: true },
    });

    if (!targetMember) {
      throw new SafeError("Member not found.");
    }

    const callerMembership = await prisma.member.findFirst({
      where: { userId, organizationId: targetMember.organizationId },
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

    if (targetMember.userId === userId) {
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

    try {
      await betterAuthConfig.api.removeMember({
        body: {
          memberIdOrEmail: memberId,
          organizationId: targetMember.organizationId,
        },
        headers: await headers(),
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        // Better Auth will throw UI-friendly errors with error messages
        throw new SafeError(error.message, 400);
      }
      throw new SafeError("Failed to remove member", 500);
    }

    revalidatePath("/api/organizations/members");

    return { success: true, message: "Member removed successfully" };
  });
