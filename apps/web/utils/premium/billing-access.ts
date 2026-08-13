import { SafeError } from "@/utils/error";
import { isAdminForPremium } from "@/utils/premium";
import { isOrganizationAdmin } from "@/utils/organizations/roles";

export const billingAccessSelect = {
  emailAccounts: {
    select: {
      members: { select: { role: true } },
    },
  },
} as const;

// Spread inside a `premium: { select: ... } }` alongside billingAccessSelect —
// canManageBilling needs both halves.
export const billingAccessPremiumSelect = {
  id: true,
  admins: { select: { id: true } },
} as const;

type BillingAccessUser = {
  premium: { id: string; admins: { id: string }[] } | null | undefined;
  emailAccounts: Array<{ members: Array<{ role: string }> }>;
};

export function canManageBilling(userId: string, user: BillingAccessUser) {
  const organizationMemberships = user.emailAccounts.flatMap(
    (emailAccount) => emailAccount.members,
  );

  if (organizationMemberships.length > 0) {
    return isOrganizationAdmin(organizationMemberships);
  }

  const { premium } = user;
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
