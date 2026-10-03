import type { people_v1 } from "@googleapis/people";
import {
  MAX_CONTACT_RESULTS,
  normalizeContactCandidates,
} from "@/utils/email/contact";
import { env } from "@/env";
import { canonicalizeEmailAddress } from "@/utils/email";
import {
  isGmailInsufficientPermissionsError,
  isGmailQuotaExceededError,
  isGmailRateLimitExceededError,
} from "@/utils/error";
import { extractErrorInfo } from "@/utils/gmail/retry";
import type { Logger } from "@/utils/logger";

const CONTACT_READ_MASK = "names,emailAddresses,photos";
const PHOTO_READ_MASK = "emailAddresses,photos";
const PHOTO_PAGE_SIZE = 1000;
const MAX_PHOTO_PAGES = 5;
// Bounds the cached map and the payload sent to the browser.
const MAX_CONTACT_PHOTOS = 2000;

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

/** Real (non-placeholder) contact photos keyed by canonical email address. */
export async function listContactPhotos(
  client: people_v1.People,
  logger: Logger,
) {
  const [saved, other] = await Promise.all([
    loadContactSource(
      () =>
        listPeoplePages(async (pageToken) => {
          const res = await client.people.connections.list({
            resourceName: "people/me",
            personFields: PHOTO_READ_MASK,
            pageSize: PHOTO_PAGE_SIZE,
            pageToken,
          });
          return {
            people: res.data.connections,
            nextPageToken: res.data.nextPageToken,
          };
        }),
      "contacts",
      logger,
    ),
    env.NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED
      ? loadContactSource(
          () =>
            listPeoplePages(async (pageToken) => {
              const res = await client.otherContacts.list({
                readMask: PHOTO_READ_MASK,
                pageSize: PHOTO_PAGE_SIZE,
                pageToken,
              });
              return {
                people: res.data.otherContacts,
                nextPageToken: res.data.nextPageToken,
              };
            }),
          "otherContacts",
          logger,
        )
      : undefined,
  ]);

  // An empty map would be cached as "this account has no photos".
  if (saved.deniedError && (!other || other.deniedError))
    throw saved.deniedError;

  const photos: Record<string, string> = {};
  let count = 0;
  // Saved contacts come first so the user's own choice of photo wins.
  for (const person of [
    ...(saved.contacts ?? []),
    ...(other?.contacts ?? []),
  ]) {
    const photoUrl = getPhotoUrl(person);
    if (!photoUrl) continue;

    for (const emailAddress of person.emailAddresses ?? []) {
      if (!emailAddress.value) continue;
      const key = canonicalizeEmailAddress(emailAddress.value);
      if (photos[key]) continue;

      photos[key] = photoUrl;
      count++;
      if (count === MAX_CONTACT_PHOTOS) return photos;
    }
  }

  return photos;
}

async function loadContactSource<T>(
  load: () => Promise<T[]>,
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
  // Google 403 rate-limit payloads reuse PERMISSION_DENIED; do not treat them as missing access.
  if (
    isGmailRateLimitExceededError(error) ||
    isGmailQuotaExceededError(error)
  ) {
    return false;
  }

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
    readMask: CONTACT_READ_MASK,
    pageSize: MAX_CONTACT_RESULTS,
  });

  return mapSearchResults(res.data.results);
}

async function searchOtherContacts(client: people_v1.People, query: string) {
  const res = await client.otherContacts.search({
    query,
    readMask: CONTACT_READ_MASK,
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
                profilePictureUrl: getPhotoUrl(person),
              },
            ]
          : [],
      );
    }) ?? []
  );
}

async function listPeoplePages(
  loadPage: (pageToken: string | undefined) => Promise<{
    people: people_v1.Schema$Person[] | undefined;
    nextPageToken: string | null | undefined;
  }>,
) {
  const people: people_v1.Schema$Person[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PHOTO_PAGES; page++) {
    const result = await loadPage(pageToken);
    people.push(...(result.people ?? []));
    pageToken = result.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  return people;
}

// Google fills in a generated letter tile when a person has no photo.
function getPhotoUrl(person: people_v1.Schema$Person) {
  return person.photos?.find((photo) => !photo.default)?.url ?? undefined;
}
