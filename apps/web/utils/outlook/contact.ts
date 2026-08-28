import type { Contact, Person } from "@microsoft/microsoft-graph-types";
import type { Logger } from "@/utils/logger";
import { withMicrosoftGraphRetry } from "@/utils/microsoft/retry";
import type { OutlookClient } from "@/utils/outlook/client";
import { isOutlookAccessDeniedError } from "@/utils/error";
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
  const trimmedQuery = query.trim();

  // Neither source alone covers a mailbox: /me/contacts reads only the default
  // saved-contacts folder, while /me/people adds the directory and recent
  // correspondents. Their scopes are optional and were requested at different
  // times, so an account may hold only one of them — a denial on one source
  // must not suppress the other.
  const [saved, people] = await Promise.all([
    loadContactSource(
      () => listSavedContacts(client, trimmedQuery, logger),
      "contacts",
      logger,
    ),
    loadContactSource(
      () => searchRelevantPeople(client, trimmedQuery, logger),
      "people",
      logger,
    ),
  ]);

  if (saved.deniedError && people.deniedError) throw saved.deniedError;

  // Saved contacts lead because they are the address book the user curated;
  // relevance-ranked people then fill the remaining slots.
  return normalizeContactCandidates([
    ...(saved.contacts ?? []),
    ...(people.contacts ?? []),
  ]);
}

async function loadContactSource(
  load: () => Promise<EmailContact[]>,
  source: "contacts" | "people",
  logger: Logger,
) {
  try {
    return { contacts: await load(), deniedError: undefined };
  } catch (error) {
    if (!isContactSourceDenied(error)) throw error;

    logger.info("Outlook contact source not permitted", { source });
    return { contacts: undefined, deniedError: error };
  }
}

// Graph reports a missing delegated scope as a 403 whose code varies by
// resource (ErrorAccessDenied for Outlook, Authorization_RequestDenied for
// People), so fall back to the status when the code is unfamiliar.
function isContactSourceDenied(error: unknown) {
  return (
    isOutlookAccessDeniedError(error) ||
    (error as { statusCode?: number })?.statusCode === 403
  );
}

async function listSavedContacts(
  client: OutlookClient,
  query: string,
  logger: Logger,
) {
  const graphClient = client.getClient();
  const normalizedQuery = query.toLowerCase();
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

async function searchRelevantPeople(
  client: OutlookClient,
  query: string,
  logger: Logger,
) {
  let request = client
    .getClient()
    .api("/me/people")
    .select("displayName,scoredEmailAddresses,userPrincipalName");

  if (query) request = request.search(query);

  const response: { value?: Person[] } = await withMicrosoftGraphRetry(
    () => request.top(MAX_CONTACT_RESULTS).get(),
    logger,
  );

  return (response.value ?? []).flatMap((person) => {
    const addresses = person.scoredEmailAddresses?.length
      ? person.scoredEmailAddresses.map((email) => email.address)
      : [person.userPrincipalName];

    return addresses.flatMap((emailAddress) =>
      emailAddress
        ? [{ emailAddress, name: person.displayName ?? undefined }]
        : [],
    );
  });
}
