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
    const userMembership = await prisma.member.findFirst({
      where: { userId },
      select: { organizationId: true, role: true },
    });

    if (!userMembership) {
      throw new SafeError("You are not a member of any organization.");
    }

    if (!hasOrganizationAdminRole(userMembership.role)) {
      throw new SafeError(
        "Only organization owners or admins can remove members.",
      );
    }

    try {
      await betterAuthConfig.api.removeMember({
        body: {
          memberIdOrEmail: memberId,
          organizationId: userMembership.organizationId,
        },
        headers: await headers(),
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new SafeError(error.message, 400);
      }
      throw new SafeError("Failed to remove member", 500);
    }

    revalidatePath("/api/organizations/members");

    return { success: true, message: "Member removed successfully" };
  });
