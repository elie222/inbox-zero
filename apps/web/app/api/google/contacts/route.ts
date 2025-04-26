import type { people_v1 } from "@googleapis/people";
import { z } from "zod";
import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getContactsClient } from "@/utils/gmail/client";
import { searchContacts } from "@/utils/gmail/contact";
import { env } from "@/env";
import prisma from "@/utils/prisma";

const contactsQuery = z.object({ query: z.string() });
export type ContactsQuery = z.infer<typeof contactsQuery>;
export type ContactsResponse = Awaited<ReturnType<typeof getContacts>>;

async function getContacts(client: people_v1.People, query: string) {
  const result = await searchContacts(client, query);
  return { result };
}

export const GET = withEmailAccount(async (request) => {
  if (!env.NEXT_PUBLIC_CONTACTS_ENABLED)
    return NextResponse.json({ error: "Contacts API not enabled" });

  const emailAccountId = request.auth.emailAccountId;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: { access_token: true, refresh_token: true, expires_at: true },
      },
    },
  });
  const client = getContactsClient({
    accessToken: emailAccount?.account.access_token,
    refreshToken: emailAccount?.account.refresh_token,
    expiryDate: emailAccount?.account.expires_at,
  });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const searchQuery = contactsQuery.parse({ query });

  const result = await getContacts(client, searchQuery.query);

  return NextResponse.json(result);
});
