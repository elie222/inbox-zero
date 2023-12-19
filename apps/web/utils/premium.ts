export const isPremium = (lemonSqueezyRenewsAt?: Date | null): boolean => {
  return !!lemonSqueezyRenewsAt && lemonSqueezyRenewsAt > new Date();
};
