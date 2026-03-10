const INCLUDED_EMAIL_ACCOUNTS_PER_USER = 2;

export function calculatePremiumBillingQuantity(
  users: { emailAccountCount: number }[],
) {
  if (!users.length) return 0;

  const billableUsers = users.length;
  const totalEmailAccounts = users.reduce(
    (sum, user) => sum + Math.max(user.emailAccountCount, 0),
    0,
  );
  const extraEmailAccounts = Math.max(
    totalEmailAccounts - billableUsers * INCLUDED_EMAIL_ACCOUNTS_PER_USER,
    0,
  );

  return billableUsers + extraEmailAccounts;
}
