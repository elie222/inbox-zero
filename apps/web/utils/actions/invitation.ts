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
  .action(async ({ ctx: { userId }, parsedInput: { invitationId } }) => {
    const nextHeaders = await headers();

    let invitation: Invitation;
    try {
      invitation = await betterAuthConfig.api.getInvitation({
        query: {
          id: invitationId,
        },
        headers: nextHeaders,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        // Better Auth will throw UI-friendly errors with error messages
        // for expired, already accepted, not found, invalid, etc.
        throw new SafeError(error.message, 400);
      }
      throw new SafeError("Failed to fetch invitation", 500);
    }

    if (!invitation) {
      throw new SafeError("Invitation not found", 404);
    }

    const userEmailAccounts = await prisma.emailAccount.findMany({
      where: {
        userId: userId,
      },
      select: {
        email: true,
      },
    });

    const userEmails = userEmailAccounts.map((account) => account.email);
    const emailMatches = userEmails.includes(invitation.email);

    if (!emailMatches) {
      throw new SafeError(
        "This invitation was sent to an account associated with a different email address.",
        400,
      );
    }

    try {
      const acceptResult = await betterAuthConfig.api.acceptInvitation({
        body: {
          invitationId,
        },
        headers: nextHeaders,
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

    return {
      redirectUrl: "/welcome",
      organizationId: invitation.organizationId,
    };
  });
