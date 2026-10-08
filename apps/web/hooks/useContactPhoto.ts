import useSWR from "swr";
import type { ContactPhotosResponse } from "@/app/api/user/contacts/photos/route";
import { env } from "@/env";
import { canonicalizeEmailAddress } from "@/utils/email";

export function useContactPhoto({
  email,
  emailAccountId,
}: {
  email: string | null | undefined;
  emailAccountId: string | null | undefined;
}) {
  // Every avatar shares one key, so a page full of senders costs one request.
  const { data } = useSWR<ContactPhotosResponse>(
    env.NEXT_PUBLIC_CONTACTS_ENABLED && email && emailAccountId
      ? ["/api/user/contacts/photos", emailAccountId]
      : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  if (!email) return;

  return data?.photos[canonicalizeEmailAddress(email)];
}
