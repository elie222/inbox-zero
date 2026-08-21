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

  const premiumAdminIds = new Set(premium.admins.map((admin) => admin.id));

  // Only the recorded purchaser/admin may manage billing. An empty admins array
  // does NOT grant access — syncStripeDataToDb now persists the purchaser on
  // every sync, and the backfill action covers existing records.
  if (premiumAdminIds.has(userId)) {
    if (organizationMemberships.length === 0) return true;
    return isOrganizationAdmin(organizationMemberships);
  }

  // Allow an org admin/owner whose org's owner holds this premium. The legacy
  // identity check (user.id === premium.id) covers plans predating the admins
  // relation.
  const premiumOrganizationMemberships = organizationMemberships.filter(
    (membership) =>
      membership.organization.members.some(({ emailAccount: { user } }) => {
        if (user.premiumId !== premium.id) return false;
        return premiumAdminIds.has(user.id) || user.id === premium.id;
      }),
  );

  if (premiumOrganizationMemberships.length > 0) {
    return isOrganizationAdmin(premiumOrganizationMemberships);
  }

  return false;
}

export function assertCanManageBilling(
  userId: string,
  user: BillingAccessUser,
) {
  if (!canManageBilling(userId, user)) {
    throw new SafeError("Not admin");
  }
}
