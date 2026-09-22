import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { swrFetcher } from "@/providers/swr-fetcher";

export const EMAIL_ACCOUNTS_KEY = "/api/user/email-accounts";

let inflight: Promise<GetEmailAccountsResponse> | null = null;
const listeners = new Set<(data: GetEmailAccountsResponse) => void>();

export function fetchEmailAccounts(): Promise<GetEmailAccountsResponse> {
  if (!inflight) {
    inflight = (
      swrFetcher(EMAIL_ACCOUNTS_KEY) as Promise<GetEmailAccountsResponse>
    )
      .then((data) => {
        for (const listener of listeners) listener(data);
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

export function subscribeEmailAccounts(
  listener: (data: GetEmailAccountsResponse) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetEmailAccountsInflight() {
  inflight = null;
}
