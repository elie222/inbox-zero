import { people_v1 } from "googleapis";

export async function searchContacts(client: people_v1.People, query: string) {
  const res = await client.people.searchContacts({
    query,
    readMask: "names,emailAddresses",
    pageSize: 10,
  });

  const contacts =
    res.data.results?.filter((c) => c.person?.emailAddresses?.[0]) || [];

  return contacts;
}
