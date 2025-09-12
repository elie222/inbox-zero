import useSWR from "swr";
import { useParams } from "next/navigation";
import { useAccount } from "@/providers/EmailAccountProvider";

export function useOrgSWR<T>(
  url: string | null,
  options?: {
    emailAccountId?: string;
  },
) {
  const params = useParams<{ emailAccountId: string | undefined }>();
  const { emailAccountId: contextEmailAccountId } = useAccount();
  const emailAccountId =
    options?.emailAccountId || params.emailAccountId || contextEmailAccountId;

  return useSWR<T>(url, (url: string) =>
    fetch(url, {
      headers: {
        "X-Email-Account-ID": emailAccountId,
      },
    }).then((res) => res.json()),
  );
}
