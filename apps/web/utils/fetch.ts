import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

/**
 * A wrapper around the native fetch function that automatically adds the
 * EMAIL_ACCOUNT_HEADER if an emailAccountId is provided.
 */
export const fetchWithAccount = async ({
  url,
  emailAccountId,
  init,
}: {
  url: string | URL | Request;
  emailAccountId: string | null;
  init?: RequestInit;
}): Promise<Response> => {
  const headers = new Headers(init?.headers);

  if (emailAccountId) {
    headers.set(EMAIL_ACCOUNT_HEADER, emailAccountId);
  }

  const newInit = { ...init, headers };

  return fetch(url, newInit);
};
