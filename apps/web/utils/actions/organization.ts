"use server";

import { actionClient, actionClientUser } from "@/utils/actions/safe-action";
import {
  createOrganizationBody,
  inviteMemberBody,
  removeMemberBody,
  cancelInvitationBody,
  handleInvitationBody,
} from "@/utils/actions/organization.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";
import { sendOrganizationInvitation } from "@/utils/organizations/invitations";
import {
  claimPendingPremiumInvite,
  removeFromPendingInvites,
  removeUserFromPremium,
} from "@/utils/premium/server";
import { env } from "@/env";

export const createOrganizationAction = actionClient
  .metadata({ name: "createOrganization" })
  .inputSchema(createOrganizationBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { name, slug } }) => {
    const existingMembership = await prisma.member.findFirst({
      where: { emailAccountId },
      select: { id: true },
    });

    if (existingMembership) {
      throw new SafeError(
        "You are already a member of an organization. You can only be part of one organization at a time.",
      );
    }

    const existingOrganization = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existingOrganization) {
      throw new SafeError(
        "An organization with this slug already exists. Please choose a different slug.",
      );
    }

    const organization = await prisma.organization.create({
      data: { name, slug },
      select: { id: true, name: true, slug: true, createdAt: true },
    });

    await prisma.member.create({
      data: {
        organizationId: organization.id,
        emailAccountId,
        role: "owner",
      },
    });

    return organization;
  });

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

async function getInvitation({
  emailAccountId,
  invitationId,
}: {
  emailAccountId: string;
  invitationId: string;
}): Promise<{
  id: string;
  organizationId: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
  inviterId: string;
}> {
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
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "accepted" },
    });
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

  const premium = await getOrganizationPremium(invitation.organizationId);
  if (premium) {
    const emailAccount = await getUserFromEmailAccount(emailAccountId);
    if (emailAccount?.user) {
      await claimPendingPremiumInvite({
        premiumId: premium.id,
        visitorId: emailAccount.user.id,
        email: emailAccount.email,
      });
    }
  }

  return {
    organizationId: invitation.organizationId,
    memberId: createdMember.id,
  };
}

export const removeMemberAction = actionClientUser
  .metadata({ name: "removeMember" })
  .inputSchema(removeMemberBody)
  .action(async ({ ctx: { userId }, parsedInput: { memberId } }) => {
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
        organizationId: targetMember.organizationId,
        emailAccount: { userId },
      },
      select: { role: true, emailAccountId: true },
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
    if (targetMember.emailAccountId === callerMembership.emailAccountId) {
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

    const premium = await getOrganizationPremium(targetMember.organizationId);
    if (premium) {
      const emailAccount = await getUserFromEmailAccount(
        targetMember.emailAccountId,
      );
      if (emailAccount?.user) {
        await removeUserFromPremium({
          premiumId: premium.id,
          visitorId: emailAccount.user.id,
        });
      }
    }

    await prisma.member.delete({ where: { id: memberId } });
  });

export const cancelInvitationAction = actionClientUser
  .metadata({ name: "cancelInvitation" })
  .inputSchema(cancelInvitationBody)
  .action(async ({ ctx: { userId }, parsedInput: { invitationId } }) => {
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        email: true,
      },
    });

    if (!invitation) {
      throw new SafeError("Invitation not found.");
    }

    if (invitation.status !== "pending") {
      throw new SafeError("Only pending invitations can be cancelled.");
    }

    const callerMembership = await prisma.member.findFirst({
      where: {
        organizationId: invitation.organizationId,
        emailAccount: { userId },
      },
      select: { role: true },
    });

    if (!callerMembership) {
      throw new SafeError("You are not a member of this organization.");
    }

    if (!hasOrganizationAdminRole(callerMembership.role)) {
      throw new SafeError(
        "Only organization owners or admins can cancel invitations.",
      );
    }

    // Remove from premium pending invites
    const premium = await getOrganizationPremium(invitation.organizationId);
    if (premium) {
      await removeFromPendingInvites({
        email: invitation.email,
        premiumId: premium.id,
      });
    }

    const result = await prisma.invitation.deleteMany({
      where: { id: invitationId, status: "pending" },
    });
    if (result.count === 0) {
      throw new SafeError("Invitation no longer pending.");
    }
  });

async function getOrganizationPremium(organizationId: string) {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) return;
  const owner = await prisma.member.findFirst({
    where: { organizationId, role: "owner" },
    select: {
      emailAccount: {
        select: {
          user: {
            select: {
              premium: {
                select: {
                  id: true,
                  pendingInvites: true,
                },
              },
            },
          },
        },
      },
    },
  });
  return owner?.emailAccount.user.premium;
}

async function getUserFromEmailAccount(emailAccountId: string) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { email: true, user: { select: { id: true } } },
  });
  return emailAccount;
}
