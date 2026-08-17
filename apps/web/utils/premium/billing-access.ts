import type { Prisma } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";
import { isAdminForPremium } from "@/utils/premium";
import { isOrganizationAdmin } from "@/utils/organizations/roles";

export const organizationOwnerPremiumSelect = {
  members: {
    where: { role: "owner" },
    select: {
      emailAccount: {
        select: { user: { select: { premiumId: true } } },
      },
    },
  },
} as const;

const billingAccessMembershipSelect = {
  role: true,
  organization: {
    select: organizationOwnerPremiumSelect,
  },
} as const;

export const billingAccessSelect = {
  emailAccounts: {
    select: {
      members: {
        select: billingAccessMembershipSelect,
      },
    },
  },
} as const;

export const billingAccessPremiumSelect = {
  id: true,
  admins: {
    select: {
      id: true,
    },
  },
} as const;

type OrganizationMembership = Prisma.MemberGetPayload<{
  select: typeof billingAccessMembershipSelect;
}>;

type BillingAccessUser = {
  premium:
    | Prisma.PremiumGetPayload<{ select: typeof billingAccessPremiumSelect }>
    | null
    | undefined;
  emailAccounts: Array<{ members: OrganizationMembership[] }>;
};

export function canManageBilling(userId: string, user: BillingAccessUser) {
  const { premium } = user;
  const organizationMemberships = user.emailAccounts.flatMap(
    (emailAccount) => emailAccount.members,
  );

  if (!premium) {
    if (organizationMemberships.length === 0) return true;
    return isOrganizationAdmin(organizationMemberships);
  }

  const premiumOrganizationMemberships = organizationMemberships.filter(
    (membership) =>
      membership.organization.members.some(
        (owner) => owner.emailAccount.user.premiumId === premium.id,
      ),
  );

  if (premiumOrganizationMemberships.length > 0) {
    return isOrganizationAdmin(premiumOrganizationMemberships);
  }

  if (premium.admins.length > 0) {
    return isAdminForPremium(premium.admins, userId);
  }

  // The initial premium migration used the owner's user ID as the premium ID.
  return premium.id === userId;
}

export function assertCanManageBilling(
  userId: string,
  user: BillingAccessUser,
) {
  if (!canManageBilling(userId, user)) {
    throw new SafeError("Not admin");
  }
}
