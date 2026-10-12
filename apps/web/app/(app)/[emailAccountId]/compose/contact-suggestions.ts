import { useEffect, useState } from "react";
import type {
  ContactSuggestion,
  ContactSuggestionQuery,
} from "@inboxzero/mail-core/queries";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import { getActiveMailClient } from "@/utils/mail-engine/active-client";
import type { ContactsResponse } from "@/app/api/user/contacts/route";

type ComposeContact = ContactsResponse["contacts"][number];

export function mergeContactSuggestions(
  local: ContactSuggestion[],
  api: ComposeContact[],
  selectedAddresses: Set<string>,
): ComposeContact[] {
  const seen = new Set(
    [...selectedAddresses].map((address) => address.toLowerCase()),
  );
  const results: ComposeContact[] = [];
  for (const contact of [...local.slice(0, 6), ...api]) {
    const email = contact.emailAddress.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    results.push(contact);
    if (results.length === 8) break;
  }
  return results;
}

export function useLocalContactSuggestions({
  emailAccountId,
  ownAddresses,
  selectedAddresses,
  query,
  active,
}: {
  emailAccountId: string;
  ownAddresses: string[];
  selectedAddresses: Set<string>;
  query: string;
  active: boolean;
}) {
  const client = useOptionalMailClient() ?? getActiveMailClient();
  const requestKey =
    active && query
      ? JSON.stringify({
          accountId: emailAccountId,
          ownAddresses,
          excludeEmails: [...selectedAddresses],
          query,
        } satisfies ContactSuggestionQuery)
      : null;
  const [result, setResult] = useState<{
    requestKey: string;
    contacts: ContactSuggestion[];
  } | null>(null);
  useEffect(() => {
    if (!requestKey || !client?.queryContactSuggestions) return;
    let cancelled = false;
    client
      .queryContactSuggestions(JSON.parse(requestKey) as ContactSuggestionQuery)
      .then((contacts) => {
        if (!cancelled) setResult({ requestKey, contacts });
      })
      .catch(() => {
        if (!cancelled) setResult({ requestKey, contacts: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [client, requestKey]);
  return result?.requestKey === requestKey ? (result?.contacts ?? []) : [];
}
