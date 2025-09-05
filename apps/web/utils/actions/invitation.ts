"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { handleInvitationBody } from "@/utils/actions/invitation.validation";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { headers } from "next/headers";
import prisma from "@/utils/prisma";
import type { Invitation } from "better-auth/plugins";

export const handleInvitationAction = actionClientUser
  .metadata({ name: "handleInvitation" })
  .schema(handleInvitationBody)
  .action(async ({ parsedInput: { invitationId } }) => {
    const session = await betterAuthConfig.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      throw new SafeError("User not authenticated", 401);
    }

    let invitation: Invitation;
    try {
      invitation = await betterAuthConfig.api.getInvitation({
        query: {
          id: invitationId,
        },
        headers: await headers(),
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new SafeError(error.message, 400);
      }
      throw new SafeError("Failed to fetch invitation", 500);
    }

    if (!invitation) {
      throw new SafeError("Invitation not found", 404);
    }

    const userEmailAccounts = await prisma.emailAccount.findMany({
      where: {
        user: {
          id: session.user.id,
        },
      },
      select: {
        email: true,
      },
    });

    const userEmails = userEmailAccounts.map((account) => account.email);
    const allUserEmails = [session.user.email, ...userEmails];
    const emailMatches = allUserEmails.includes(invitation.email);

    if (!emailMatches) {
      const emailList = allUserEmails.join(", ");
      throw new SafeError(
        `You're logged in as ${session.user.email} (email accounts: ${emailList}), but this invitation was sent to ${invitation.email}. Please logout and sign in with the correct account.`,
        400,
      );
    }

    try {
      const acceptResult = await betterAuthConfig.api.acceptInvitation({
        body: {
          invitationId,
        },
        headers: await headers(),
      });

      if (!acceptResult) {
        throw new SafeError("Failed to accept invitation", 400);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        // Better Auth will throw UI-friendly errors with error messages
        // for expired, already accepted, not found, invalid, etc.
        throw new SafeError(error.message, 400);
      }
      throw new SafeError("Failed to accept invitation", 500);
    }

    const organization = await prisma.organization.findUnique({
      where: { id: invitation.organizationId },
      select: { name: true },
    });

    return {
      redirectUrl: "/welcome",
      organizationId: invitation.organizationId,
      organizationName: organization?.name || "the organization",
    };
  });
