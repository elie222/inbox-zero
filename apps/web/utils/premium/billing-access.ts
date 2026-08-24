import type { Prisma } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";
import { isOrganizationAdmin } from "@/utils/organizations/roles";

export const organizationBillingPrincipalsSelect = {
  members: {
    where: {
      OR: [
        { role: "owner" },
        { emailAccount: { user: { premiumAdminId: { not: null } } } },
      ],
    },
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
    select: organizationBillingPrincipalsSelect,
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

  // Invited seats share a premium, so billing access must stay anchored to a
  // recorded plan admin or the legacy owner whose user ID was the premium ID.
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
