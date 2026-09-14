import type { people_v1 } from "@googleapis/people";
import {
  type EmailContact,
  MAX_CONTACT_RESULTS,
  normalizeContactCandidates,
} from "@/utils/email/contact";
import { env } from "@/env";
import { isGmailInsufficientPermissionsError } from "@/utils/error";
import { extractErrorInfo } from "@/utils/gmail/retry";
import type { Logger } from "@/utils/logger";

const SAVED_CONTACT_READ_MASK = "names,emailAddresses,photos";
const OTHER_CONTACT_READ_MASK = "names,emailAddresses";

export async function searchContacts(
  client: people_v1.People,
  query: string,
  logger: Logger,
) {
  if (!env.NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED) {
    return normalizeContactCandidates(await searchSavedContacts(client, query));
  }

  // Saved Google Contacts are only the address book the user curated. Gmail's
  // compose autocomplete also searches Other Contacts — people the user has
  // emailed — so both sources are required for Gmail-like suggestions.
  const [saved, other] = await Promise.all([
    loadContactSource(
      () => searchSavedContacts(client, query),
      "contacts",
      logger,
    ),
    loadContactSource(
      () => searchOtherContacts(client, query),
      "otherContacts",
      logger,
    ),
  ]);

  if (saved.deniedError && other.deniedError) throw saved.deniedError;

  return normalizeContactCandidates([
    ...(saved.contacts ?? []),
    ...(other.contacts ?? []),
  ]);
}

async function loadContactSource(
  load: () => Promise<EmailContact[]>,
  source: "contacts" | "otherContacts",
  logger: Logger,
) {
  try {
    return { contacts: await load(), deniedError: undefined };
  } catch (error) {
    if (!isContactSourceDenied(error)) throw error;

    logger.info("Gmail contact source not permitted", { source });
    return { contacts: undefined, deniedError: error };
  }
}

function isContactSourceDenied(error: unknown) {
  if (isGmailInsufficientPermissionsError(error)) return true;

  const record = error as { code?: unknown; status?: unknown };
  if (
    record.status === "PERMISSION_DENIED" ||
    record.code === "PERMISSION_DENIED"
  ) {
    return true;
  }

  const errorInfo = extractErrorInfo(error);
  return (
    errorInfo.reason === "insufficientPermissions" ||
    errorInfo.googleErrorStatus === "PERMISSION_DENIED"
  );
}

async function searchSavedContacts(client: people_v1.People, query: string) {
  const res = await client.people.searchContacts({
    query,
    readMask: SAVED_CONTACT_READ_MASK,
    pageSize: MAX_CONTACT_RESULTS,
  });

  return mapSearchResults(res.data.results);
}

async function searchOtherContacts(client: people_v1.People, query: string) {
  const res = await client.otherContacts.search({
    query,
    readMask: OTHER_CONTACT_READ_MASK,
    pageSize: MAX_CONTACT_RESULTS,
  });

  return mapSearchResults(res.data.results);
}

function mapSearchResults(
  results: people_v1.Schema$SearchResult[] | undefined,
) {
  return (
    results?.flatMap((contact) => {
      const person = contact.person;
      if (!person) return [];

      return (person.emailAddresses ?? []).flatMap((emailAddress) =>
        emailAddress.value
          ? [
              {
                emailAddress: emailAddress.value,
                name: person.names?.[0]?.displayName ?? undefined,
                profilePictureUrl: person.photos?.[0]?.url ?? undefined,
              },
            ]
          : [],
      );
    }) ?? []
  );
}
