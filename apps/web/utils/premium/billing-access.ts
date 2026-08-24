import type { Prisma } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";
import { isOrganizationAdmin } from "@/utils/organizations/roles";

export const organizationOwnerPremiumSelect = {
  members: {
    where: { role: "owner" },
    select: {
      emailAccount: {
        select: { user: { select: { id: true, premiumId: true } } },
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

  // The purchaser is the recorded premium admin (written from Stripe customer
  // metadata at sync time), or the legacy owner whose user id doubles as the
  // premium id. An empty admins list grants nothing: every invited seat user
  // shares the premium, so anyone who is not the purchaser must qualify
  // through an organization that actually contains the purchaser.
  const premiumAdminIds = new Set(premium.admins.map((admin) => admin.id));
  const isPurchaser = premiumAdminIds.has(userId) || premium.id === userId;

  if (isPurchaser) {
    if (organizationMemberships.length === 0) return true;
    return isOrganizationAdmin(organizationMemberships);
  }

  const purchaserOrganizationMemberships = organizationMemberships.filter(
    (membership) =>
      membership.organization.members.some(({ emailAccount: { user } }) => {
        if (user.premiumId !== premium.id) return false;
        return premiumAdminIds.has(user.id) || user.id === premium.id;
      }),
  );
  if (purchaserOrganizationMemberships.length === 0) return false;

  return isOrganizationAdmin(purchaserOrganizationMemberships);
}

export function assertCanManageBilling(
  userId: string,
  user: BillingAccessUser,
) {
  if (!canManageBilling(userId, user)) {
    throw new SafeError("Not admin");
  }
}
