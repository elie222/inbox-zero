import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";

export function getOwnEmailAccount(data: GetEmailAccountsResponse | undefined) {
  return data?.emailAccounts?.find((account) => account.isPrimary);
}
