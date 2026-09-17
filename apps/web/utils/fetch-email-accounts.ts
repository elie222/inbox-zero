import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { swrFetcher } from "@/providers/swr-fetcher";

export const EMAIL_ACCOUNTS_KEY = "/api/user/email-accounts";

let inflight: Promise<GetEmailAccountsResponse> | null = null;

export function fetchEmailAccounts(): Promise<GetEmailAccountsResponse> {
  if (!inflight) {
    inflight = (
      swrFetcher(EMAIL_ACCOUNTS_KEY) as Promise<GetEmailAccountsResponse>
    ).finally(() => {
      inflight = null;
    });
  }

  return inflight;
}

export function resetEmailAccountsInflight() {
  inflight = null;
}
