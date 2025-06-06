import type { people_v1 } from "@googleapis/people";

export async function searchContacts(client: people_v1.People, query: string) {
  const readMasks: (keyof people_v1.Schema$Person)[] = [
    "names",
    "emailAddresses",
    "photos",
  ];

  const res = await client.people.searchContacts({
    query,
    readMask: readMasks.join(","),
    pageSize: 10,
  });

  const contacts =
    res.data.results?.filter((c) => c.person?.emailAddresses?.[0]) || [];

  return contacts;
}
