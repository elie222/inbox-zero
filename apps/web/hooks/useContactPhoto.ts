import useSWR from "swr";
import type { ContactsResponse } from "@/app/api/user/contacts/route";
import { env } from "@/env";
import { isSameEmailAddress } from "@/utils/email";

export function useContactPhoto({
  email,
  emailAccountId,
}: {
  email: string | null | undefined;
  emailAccountId: string | null | undefined;
}) {
  const { data } = useSWR<ContactsResponse>(
    env.NEXT_PUBLIC_CONTACTS_ENABLED && email && emailAccountId
      ? [
          `/api/user/contacts?query=${encodeURIComponent(email)}`,
          emailAccountId,
        ]
      : null,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (!email) return;

  return data?.contacts.find((contact) =>
    isSameEmailAddress(contact.emailAddress, email),
  )?.profilePictureUrl;
}
