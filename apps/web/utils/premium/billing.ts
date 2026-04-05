export function calculatePremiumBillingQuantity(options: {
  users: { emailAccountCount: number }[];
  includedEmailAccountsPerUser?: number;
}) {
  const { users, includedEmailAccountsPerUser = 1 } = options;

  if (!users.length) return 0;

  const billableUsers = users.length;
  const emailAccountsIncludedPerUser = Math.max(
    includedEmailAccountsPerUser,
    1,
  );
  const totalEmailAccounts = users.reduce(
    (sum, user) => sum + Math.max(user.emailAccountCount, 0),
    0,
  );
  const extraEmailAccounts = Math.max(
    totalEmailAccounts - billableUsers * emailAccountsIncludedPerUser,
    0,
  );

  return billableUsers + extraEmailAccounts;
}
