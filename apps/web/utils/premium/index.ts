export const isPremium = (lemonSqueezyRenewsAt: Date | null): boolean => {
  return !!lemonSqueezyRenewsAt && new Date(lemonSqueezyRenewsAt) > new Date();
};

// this is a bit hacky. better to store the plan type in the database
export const getUserPlan = (
  lemonSqueezyRenewsAt?: Date | null,
): "monthly" | "annually" | "lifetime" | null => {
  if (!lemonSqueezyRenewsAt) return null;

  const renewsAt = new Date(lemonSqueezyRenewsAt);

  // if renewsAt is 5 years in the future then it's a lifetime plan
  if (renewsAt.getFullYear() - new Date().getFullYear() >= 5) return "lifetime";

  // if renewsAt is more than 6 months in the future then it's annual plan
  if (renewsAt > new Date(new Date().setMonth(new Date().getMonth() + 6)))
    return "annually";

  // if renewsAt is less than 6 months in the future then it's a monthly plan
  return "monthly";
};

export const hasUnsubscribeAccess = (
  unsubscribeCredits?: number | null,
): boolean => {
  return unsubscribeCredits !== 0;
};
