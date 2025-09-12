import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";

/**
 * Utility function to find the primary email account from email accounts data
 */
export function getOwnEmailAccount(data: GetEmailAccountsResponse | undefined) {
  return data?.emailAccounts?.find((account) => account.isPrimary);
}
