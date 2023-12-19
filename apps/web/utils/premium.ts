export const isPremium = (lemonSqueezyRenewsAt: Date | null): boolean => {
  return !!lemonSqueezyRenewsAt && lemonSqueezyRenewsAt > new Date();
};

export const hasUnsubscribeAccess = (
  unsubscribeCredits?: number | null,
): boolean => {
  return unsubscribeCredits !== 0;
};
