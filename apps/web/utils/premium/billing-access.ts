import type { Prisma } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";
import { isAdminForPremium } from "@/utils/premium";
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

  // isAdminForPremium returns true when admins is empty — this covers Stripe
  // subscribers (sync never writes admins) and legacy plans where the purchaser
  // was not recorded. Fall back to requiring org admin/owner status.
  if (isAdminForPremium(premium.admins, userId)) {
    if (organizationMemberships.length === 0) return true;
    return isOrganizationAdmin(organizationMemberships);
  }

  // Every invited seat user shares the premium id and can own their own
  // organization, so anchor on the purchaser: a premium admin, or the legacy
  // owner whose user id doubles as the premium id.
  const premiumAdminIds = new Set(premium.admins.map((admin) => admin.id));
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
