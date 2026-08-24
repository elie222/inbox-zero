import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { withEmailProvider } from "@/utils/middleware";
import type { EmailProvider } from "@/utils/email/types";

const contactsQuery = z.object({ query: z.string().trim().max(200) });

export type ContactsResponse = Awaited<ReturnType<typeof getContacts>>;

export const GET = withEmailProvider("user/contacts", async (request) => {
  if (!env.NEXT_PUBLIC_CONTACTS_ENABLED) {
    return NextResponse.json(
      { error: "Contacts API not enabled" },
      { status: 404 },
    );
  }

  const { query } = contactsQuery.parse({
    query: new URL(request.url).searchParams.get("query"),
  });
  const result = await getContacts(request.emailProvider, query);

  return NextResponse.json(result);
});

async function getContacts(
  emailProvider: Pick<EmailProvider, "searchContacts">,
  query: string,
) {
  const contacts = await emailProvider.searchContacts(query);
  return { contacts };
}
