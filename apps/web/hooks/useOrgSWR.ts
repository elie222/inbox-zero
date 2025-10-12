import useSWR, { type SWRConfiguration, type SWRResponse } from "swr";
import { useParams } from "next/navigation";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

// Attempts to build a drop-in replacement for useSWR that handles org permissions
// Simple implementation that handles the two patterns we use:
// 1. useOrgSWR(key, options)
// 2. useOrgSWR(key, fetcher, options)
export function useOrgSWR<Data = any, Error = any>(
  key: string | null,
  fetcherOrOptions?:
    | ((url: string) => Promise<Data>)
    | (SWRConfiguration<Data, Error> & { emailAccountId?: string }),
  options?: SWRConfiguration<Data, Error> & { emailAccountId?: string },
): SWRResponse<Data, Error> {
  const params = useParams<{ emailAccountId: string | undefined }>();
  const { emailAccountId: contextEmailAccountId } = useAccount();

  // Check if second parameter is a function (fetcher) or object (options)
  const isFetcher = typeof fetcherOrOptions === "function";
  const fetcher = isFetcher ? fetcherOrOptions : undefined;
  const mergedOptions = isFetcher ? options : fetcherOrOptions;

  const emailAccountId =
    mergedOptions?.emailAccountId ||
    params.emailAccountId ||
    contextEmailAccountId;

  const orgFetcher = (url: string) =>
    fetch(url, {
      headers: {
        [EMAIL_ACCOUNT_HEADER]: emailAccountId,
      },
    }).then((res) => res.json());

  // Remove emailAccountId from options before passing to useSWR
  const { emailAccountId: _, ...swrOptions } = mergedOptions || {};

  return useSWR<Data, Error>(
    key && emailAccountId ? key : null,
    fetcher || orgFetcher,
    swrOptions,
  );
}
