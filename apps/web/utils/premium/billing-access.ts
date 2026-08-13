import { SafeError } from "@/utils/error";
import { isAdminForPremium } from "@/utils/premium";
import { isOrganizationAdmin } from "@/utils/organizations/roles";

export const billingAccessSelect = {
  emailAccounts: {
    select: {
      members: { select: { organizationId: true, role: true } },
    },
  },
} as const;

export const billingAccessPremiumSelect = {
  id: true,
  admins: {
    select: {
      id: true,
      emailAccounts: {
        select: {
          members: { select: { organizationId: true, role: true } },
        },
      },
    },
  },
} as const;

type OrganizationMembership = { organizationId: string; role: string };

type BillingAccessUser = {
  premium:
    | {
        id: string;
        admins: Array<{
          id: string;
          emailAccounts: Array<{ members: OrganizationMembership[] }>;
        }>;
      }
    | null
    | undefined;
  emailAccounts: Array<{ members: OrganizationMembership[] }>;
};

export function canManageBilling(userId: string, user: BillingAccessUser) {
  const { premium } = user;
  const organizationMemberships = user.emailAccounts.flatMap(
    (emailAccount) => emailAccount.members,
  );
  const premiumAdminMemberships =
    premium?.admins.flatMap((admin) =>
      (admin.emailAccounts ?? []).flatMap(
        (emailAccount) => emailAccount.members,
      ),
    ) ?? [];
  const ownerOrganizationIds = new Set(
    premiumAdminMemberships
      .filter((membership) => membership.role === "owner")
      .map((membership) => membership.organizationId),
  );
  const premiumOrganizationIds = ownerOrganizationIds.size
    ? ownerOrganizationIds
    : new Set(
        premiumAdminMemberships.map((membership) => membership.organizationId),
      );
  const premiumOrganizationMemberships = organizationMemberships.filter(
    (membership) => premiumOrganizationIds.has(membership.organizationId),
  );

  if (premiumOrganizationMemberships.length > 0) {
    return isOrganizationAdmin(premiumOrganizationMemberships);
  }

  if (!premium) return true;
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
