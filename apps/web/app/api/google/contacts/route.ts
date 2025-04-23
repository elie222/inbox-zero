import type { people_v1 } from "@googleapis/people";
import { z } from "zod";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getContactsClient } from "@/utils/gmail/client";
import { searchContacts } from "@/utils/gmail/contact";
import { env } from "@/env";
import { getTokens } from "@/utils/account";

const contactsQuery = z.object({ query: z.string() });
export type ContactsQuery = z.infer<typeof contactsQuery>;
export type ContactsResponse = Awaited<ReturnType<typeof getContacts>>;

async function getContacts(client: people_v1.People, query: string) {
  const result = await searchContacts(client, query);
  return { result };
}

export const GET = withAuth(async (request) => {
  if (!env.NEXT_PUBLIC_CONTACTS_ENABLED)
    return NextResponse.json({ error: "Contacts API not enabled" });

  const tokens = await getTokens({ email: request.auth.userEmail });
  if (!tokens) return NextResponse.json({ error: "Account not found" });

  const client = getContactsClient(tokens);

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const searchQuery = contactsQuery.parse({ query });

  const result = await getContacts(client, searchQuery.query);

  return NextResponse.json(result);
});
