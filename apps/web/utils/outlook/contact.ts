import type { Contact } from "@microsoft/microsoft-graph-types";
import type { Logger } from "@/utils/logger";
import { withMicrosoftGraphRetry } from "@/utils/microsoft/retry";
import type { OutlookClient } from "@/utils/outlook/client";
import {
  type EmailContact,
  MAX_CONTACT_RESULTS,
  normalizeContactCandidates,
} from "@/utils/email/contact";

const CONTACTS_PAGE_SIZE = 50;
// Graph contacts don't support substring filtering server-side, so we page
// through saved contacts client-side; the cap bounds round-trips for queries
// with few or no matches.
const MAX_CONTACT_PAGES = 20;

type OutlookContactsPage = {
  value?: Contact[];
  "@odata.nextLink"?: string;
};

export async function searchContacts(
  client: OutlookClient,
  query: string,
  logger: Logger,
) {
  const graphClient = client.getClient();
  const normalizedQuery = query.trim().toLowerCase();
  const candidates: EmailContact[] = [];
  let contacts: EmailContact[] = [];
  let request = graphClient
    .api("/me/contacts")
    .select("displayName,emailAddresses")
    .top(CONTACTS_PAGE_SIZE);

  for (let pageIndex = 0; pageIndex < MAX_CONTACT_PAGES; pageIndex++) {
    const page: OutlookContactsPage = await withMicrosoftGraphRetry(
      () => request.get(),
      logger,
    );
    for (const contact of page.value ?? []) {
      const emailAddresses =
        contact.emailAddresses?.flatMap((email) =>
          email.address ? [email.address] : [],
        ) ?? [];
      const matchesQuery =
        !normalizedQuery ||
        contact.displayName?.toLowerCase().includes(normalizedQuery) ||
        emailAddresses.some((emailAddress) =>
          emailAddress.toLowerCase().includes(normalizedQuery),
        );

      if (!matchesQuery) continue;

      candidates.push(
        ...emailAddresses.map((emailAddress) => ({
          emailAddress,
          name: contact.displayName ?? undefined,
        })),
      );
    }

    contacts = normalizeContactCandidates(candidates, MAX_CONTACT_RESULTS);
    if (contacts.length === MAX_CONTACT_RESULTS) return contacts;

    const nextLink = page["@odata.nextLink"];
    if (!nextLink) return contacts;
    request = graphClient.api(nextLink);
  }

  logger.warn("Stopped Outlook contact search after max pages", {
    maxPages: MAX_CONTACT_PAGES,
  });
  return contacts;
}
