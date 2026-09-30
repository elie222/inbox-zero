import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { withEmailProvider } from "@/utils/middleware";
import {
  ContactsAccessDeniedError,
  type EmailContact,
} from "@/utils/email/contact";
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

  return NextResponse.json(await getContacts(request.emailProvider, query));
});

async function getContacts(
  emailProvider: Pick<EmailProvider, "searchContacts">,
  query: string,
): Promise<{ contacts: EmailContact[]; reconnectRequired: boolean }> {
  try {
    return {
      contacts: await emailProvider.searchContacts(query),
      reconnectRequired: false,
    };
  } catch (error) {
    // An account that never granted the optional contact scopes is a normal
    // state of a suggestion endpoint, not a failed request, so it belongs in
    // the success body where clients can latch it instead of retrying.
    if (error instanceof ContactsAccessDeniedError) {
      return { contacts: [], reconnectRequired: true };
    }

    throw error;
  }
}
