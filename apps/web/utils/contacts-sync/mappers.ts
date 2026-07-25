import type { people_v1 } from "@googleapis/people";
import { normalizeDisplayName } from "@/utils/contacts";

// Person fields we read from and write to Google Contacts. Notes and photos
// are read-only on our side: notes stay private to Zerrow, photos can't be
// set via URL.
export const PERSON_FIELDS =
  "names,emailAddresses,phoneNumbers,organizations,photos,metadata";
export const UPDATE_PERSON_FIELDS =
  "names,emailAddresses,phoneNumbers,organizations";

export type MappedPerson = {
  resourceName: string;
  etag: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  title: string | null;
  companyName: string | null;
  photoUrl: string | null;
  deleted: boolean;
};

export function mapPersonToContact(
  person: people_v1.Schema$Person,
): MappedPerson | null {
  if (!person.resourceName) return null;

  const primaryEmail = pickPrimary(person.emailAddresses)?.value?.trim();
  if (!primaryEmail && !person.metadata?.deleted) return null;

  const organization = pickPrimary(person.organizations);
  const photo = person.photos?.find((p) => p.url && !p.default);

  return {
    resourceName: person.resourceName,
    etag: person.etag ?? null,
    email: primaryEmail?.toLowerCase() ?? "",
    // "Last, First" address-book styling flips to "First Last" on import
    name: normalizeDisplayName(
      pickPrimary(person.names)?.displayName?.trim() || null,
    ),
    phone: pickPrimary(person.phoneNumbers)?.value?.trim() || null,
    title: organization?.title?.trim() || null,
    companyName: organization?.name?.trim() || null,
    photoUrl: photo?.url ?? null,
    deleted: !!person.metadata?.deleted,
  };
}

export function contactToPersonPayload(contact: {
  email: string;
  name: string | null;
  phone: string | null;
  title: string | null;
  companyName?: string | null;
}): people_v1.Schema$Person {
  return {
    names: contact.name ? [{ unstructuredName: contact.name }] : [],
    emailAddresses: [{ value: contact.email }],
    phoneNumbers: contact.phone ? [{ value: contact.phone }] : [],
    organizations:
      contact.title || contact.companyName
        ? [
            {
              title: contact.title ?? undefined,
              name: contact.companyName ?? undefined,
            },
          ]
        : [],
  };
}

function pickPrimary<T extends { metadata?: people_v1.Schema$FieldMetadata }>(
  items: T[] | undefined | null,
): T | undefined {
  if (!items?.length) return;
  return items.find((item) => item.metadata?.primary) ?? items[0];
}
