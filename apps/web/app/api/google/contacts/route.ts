import { people_v1 } from "googleapis";
import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getContactsClient } from "@/utils/gmail/client";
import { searchContacts } from "@/utils/gmail/contact";
import { env } from "@/env.mjs";

const contactsQuery = z.object({ query: z.string() });
export type ContactsQuery = z.infer<typeof contactsQuery>;
export type ContactsResponse = Awaited<ReturnType<typeof getContacts>>;

async function getContacts(client: people_v1.People, query: string) {
  const result = await searchContacts(client, query);
  return { result };
}

export const GET = withError(async (request) => {
  if (!env.NEXT_PUBLIC_CONTACTS_ENABLED)
    return NextResponse.json({ error: "Contacts API not enabled" });

  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const client = getContactsClient(session);

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const searchQuery = contactsQuery.parse({ query });

  const result = await getContacts(client, searchQuery.query);

  return NextResponse.json(result);
});
