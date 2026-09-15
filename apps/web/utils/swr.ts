import type { SWRResponse } from "swr";
import useSWR from "swr";
import { EMAIL_ACCOUNT_ID_REQUIRED_ERROR } from "@/utils/config";
import { useAccount } from "@/providers/EmailAccountProvider";

// Makes sure that we have an email account id before fetching
// Otherwise the backend will return an error
// biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
export function useSWRWithEmailAccount<Data = any, Error = any>(url: string) {
  const { emailAccountId } = useAccount();
  return useSWR<Data, Error>(emailAccountId ? url : null);
}

// Routes scoped by the authenticated email account need the account in the
// cache key, or an account switch would serve another account's data.
export function getAccountScopedKey(
  path: string,
  emailAccountId?: string | null,
) {
  if (emailAccountId === undefined) return path;

  return emailAccountId ? ([path, emailAccountId] as const) : null;
}

export function shouldResetSwrCacheForAccountId(
  previousEmailAccountId: string | null,
  emailAccountId: string,
) {
  if (!emailAccountId) return false;
  if (previousEmailAccountId === null) return false;
  return previousEmailAccountId !== emailAccountId;
}

// Empty → id must revalidate the live scoped cache, including keys that are
// not persisted (for example a first-paint 403 on /api/user/email-account).
export function shouldRevalidateAllLiveSwrKeysForAccountId(
  previousEmailAccountId: string | null,
  emailAccountId: string,
) {
  return previousEmailAccountId === "" && Boolean(emailAccountId);
}

export function getDevSWRErrorRetryMs(
  error: { status?: number; message?: string },
  retryCount: number,
) {
  if (error.status === 404) return 500;
  // pnpm dev skips other 4xx retries; production still retries, so a missing
  // account header only sticks on the emulator/local settings page.
  if (
    error.status === 403 &&
    error.message === EMAIL_ACCOUNT_ID_REQUIRED_ERROR
  ) {
    return retryCount >= 5 ? null : 500;
  }
  if (error.status && error.status >= 400 && error.status < 500) return null;
  return 5000 * 2 ** retryCount;
}

type NormalizedError = { error: string };

/**
 * Processes the result of an SWR hook, normalizing errors.
 * Assumes the API might return an object like { error: string } instead of data on failure.
 *
 * @param swrResult The raw result from the useSWR hook.
 * @returns SWRResponse with data as TData | null and error as NormalizedError | undefined.
 */
export function processSWRResponse<
  TData,
  TApiError extends { error: string } = { error: string }, // Assume API error shape
  TSWRError = Error, // Assume SWR error type
>(
  swrResult: SWRResponse<TData | TApiError, TSWRError>,
): SWRResponse<TData | null, NormalizedError> {
  const swrError = swrResult.error as TSWRError | undefined; // Cast for type checking
  const data = swrResult.data as TData | TApiError | undefined; // Cast for type checking

  // Handle SWR hook error
  if (swrError instanceof Error) {
    return {
      ...swrResult,
      data: null,
      error: { error: swrError.message },
    } as SWRResponse<TData | null, NormalizedError>;
  }
  // Handle potential non-Error SWR errors (less common)
  if (swrError) {
    return {
      ...swrResult,
      data: null,
      error: { error: String(swrError) }, // Convert non-Error to string
    } as SWRResponse<TData | null, NormalizedError>;
  }

  // Handle API error returned within data
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return {
      ...swrResult,
      data: null,
      error: { error: data.error },
    } as SWRResponse<TData | null, NormalizedError>;
  }

  // No error found, return the data (might be null/undefined during loading)
  // Cast data to expected type, filtering out the TApiError possibility
  return {
    ...swrResult,
    data: data as TData | null, // SWR handles undefined during load
    error: undefined,
  } as SWRResponse<TData | null, NormalizedError>;
}
