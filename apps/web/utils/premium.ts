// TODO check that plan is still active
export const isPremium = (lemonSqueezyRenewsAt?: Date | null): boolean => {
  return !!lemonSqueezyRenewsAt;
};
