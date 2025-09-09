"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { inviteMemberBody } from "@/utils/actions/invite-member.validation";
import prisma from "@/utils/prisma";
import { revalidatePath } from "next/cache";
import { SafeError } from "@/utils/error";
import { betterAuthConfig } from "@/utils/auth";
import { headers } from "next/headers";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";

export const inviteMemberAction = actionClientUser
  .metadata({ name: "inviteMember" })
  .schema(inviteMemberBody)
  .action(async ({ ctx: { userId }, parsedInput: { email, role } }) => {
    const userMembership = await prisma.member.findFirst({
      where: { userId },
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

    try {
      await betterAuthConfig.api.createInvitation({
        body: {
          email,
          role: [role],
          organizationId: userMembership.organizationId,
          resend: true,
        },
        headers: await headers(),
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        // Better Auth will throw UI-friendly errors with error messages
        // for expired, already accepted, not found, invalid, etc.
        throw new SafeError(error.message, 400);
      }
      throw new SafeError("Failed to create invitation", 500);
    }

    revalidatePath("/api/organizations/members");
  });
