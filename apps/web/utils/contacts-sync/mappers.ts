import type { people_v1 } from "@googleapis/people";
import { type ContactPhone, normalizeDisplayName } from "@/utils/contacts";

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
  email: string | null;
  name: string | null;
  phones: ContactPhone[];
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
  const organization = pickPrimary(person.organizations);
  const photo = person.photos?.find((p) => p.url && !p.default);
  // "Last, First" address-book styling flips to "First Last" on import
  const name = normalizeDisplayName(
    pickPrimary(person.names)?.displayName?.trim() || null,
  );
  const phones = mapPhoneNumbers(person.phoneNumbers);

  // A person with nothing identifying isn't a contact. Deletions still map,
  // since they're matched on resourceName alone.
  if (!primaryEmail && !name && !phones.length && !person.metadata?.deleted) {
    return null;
  }

  return {
    resourceName: person.resourceName,
    etag: person.etag ?? null,
    email: primaryEmail?.toLowerCase() ?? null,
    name,
    phones,
    title: organization?.title?.trim() || null,
    companyName: organization?.name?.trim() || null,
    photoUrl: photo?.url ?? null,
    deleted: !!person.metadata?.deleted,
  };
}

export function contactToPersonPayload(contact: {
  email: string | null;
  name: string | null;
  phones: ContactPhone[];
  title: string | null;
  companyName?: string | null;
}): people_v1.Schema$Person {
  return {
    names: contact.name ? [{ unstructuredName: contact.name }] : [],
    emailAddresses: contact.email ? [{ value: contact.email }] : [],
    phoneNumbers: contact.phones.map((phone) => ({
      value: phone.value,
      type: googleTypeFromLabel(phone.label),
    })),
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

// All numbers, primary first, Google's type as a human label
function mapPhoneNumbers(
  phoneNumbers: people_v1.Schema$PhoneNumber[] | undefined | null,
): ContactPhone[] {
  if (!phoneNumbers?.length) return [];
  return [...phoneNumbers]
    .sort(
      (a, b) => Number(!!b.metadata?.primary) - Number(!!a.metadata?.primary),
    )
    .flatMap((phone) => {
      const value = phone.value?.trim();
      if (!value) return [];
      return [{ label: labelFromGoogleType(phone.type), value }];
    });
}

const GOOGLE_TYPE_LABELS: Record<string, string> = {
  mobile: "Mobile",
  workmobile: "Mobile",
  work: "Work",
  main: "Main",
  home: "Home",
  homefax: "Fax",
  workfax: "Fax",
  otherfax: "Fax",
  pager: "Pager",
  other: "Other",
};

function labelFromGoogleType(type: string | null | undefined): string {
  const normalized = type?.trim().toLowerCase();
  if (!normalized) return "Other";
  return (
    GOOGLE_TYPE_LABELS[normalized] ??
    normalized.charAt(0).toUpperCase() + normalized.slice(1)
  );
}

// Google accepts free-form types but canonical values render nicely in its
// UI, so map our common labels onto them
const LABEL_GOOGLE_TYPES: Record<string, string> = {
  mobile: "mobile",
  cell: "mobile",
  work: "work",
  office: "work",
  main: "main",
  home: "home",
  fax: "workFax",
  pager: "pager",
  other: "other",
};

function googleTypeFromLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  return LABEL_GOOGLE_TYPES[normalized] ?? (normalized || "other");
}
