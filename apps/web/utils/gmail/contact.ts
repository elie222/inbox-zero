import type { people_v1 } from "@googleapis/people";
import {
  MAX_CONTACT_RESULTS,
  normalizeContactCandidates,
} from "@/utils/email/contact";

export async function searchContacts(client: people_v1.People, query: string) {
  const readMasks: (keyof people_v1.Schema$Person)[] = [
    "names",
    "emailAddresses",
    "photos",
  ];

  const res = await client.people.searchContacts({
    query,
    readMask: readMasks.join(","),
    pageSize: MAX_CONTACT_RESULTS,
  });

  return normalizeContactCandidates(
    res.data.results?.flatMap((contact) => {
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
    }) ?? [],
  );
}
