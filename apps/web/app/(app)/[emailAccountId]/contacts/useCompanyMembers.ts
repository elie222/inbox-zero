"use client";

import useSWR from "swr";
import type { ContactsResponse } from "@/app/api/contacts/route";
import {
  type ContactListItem,
  isLikelyAutomatedSender,
} from "@/utils/contacts";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

// A company's people, fetched on demand by searching each of its domains
// against the full mail history. The page's contact list is a recency
// window (default 100), so a company whose people fall outside it would
// otherwise render "No contacts yet." under a header that counts them.
export function useCompanyMembers({
  domains,
  companyId,
  enabled = true,
}: {
  domains: string[];
  companyId?: string;
  enabled?: boolean;
}) {
  const { emailAccountId } = useAccount();

  return useSWR<ContactListItem[]>(
    enabled && domains.length
      ? `company-members:${emailAccountId}:${domains.join(",")}`
      : null,
    async () => {
      const lists = await Promise.all(
        domains.map(async (domain) => {
          const response = await fetch(
            `/api/contacts?search=${encodeURIComponent(domain)}&limit=100`,
            { headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId } },
          );
          if (!response.ok) {
            throw new Error(`Failed to load people (${response.status})`);
          }
          return (await response.json()) as ContactsResponse;
        }),
      );

      const byEmail = new Map<string, ContactListItem>();
      for (const list of lists) {
        for (const contact of list.contacts) {
          if (!domains.includes(contact.domain)) continue;
          if (contact.isPersonal) continue;
          // Automated mailboxes are excluded from the company's people
          // count, so exclude them here too
          if (!contact.email) continue;
          if (isLikelyAutomatedSender(contact.email)) continue;
          // An explicit assignment to another company wins over the domain
          if (contact.companyId && contact.companyId !== companyId) continue;
          byEmail.set(contact.email, contact);
        }
      }

      return [...byEmail.values()].sort(
        (a, b) =>
          b.receivedCount + b.sentCount - (a.receivedCount + a.sentCount),
      );
    },
  );
}
