import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { withEmailProvider } from "@/utils/middleware";
import type { EmailProvider } from "@/utils/email/types";
import {
  isGmailInsufficientPermissionsError,
  isOutlookAccessDeniedError,
} from "@/utils/error";

const contactsQuery = z.object({ query: z.string().trim().max(200) });

export type ContactsResponse = Awaited<ReturnType<typeof getContacts>>;
export type ContactsErrorResponse = {
  error: string;
  isKnownError: true;
  reconnectRequired: true;
};

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
  let result: ContactsResponse;
  try {
    result = await getContacts(request.emailProvider, query);
  } catch (error) {
    if (
      isGmailInsufficientPermissionsError(error) ||
      isOutlookAccessDeniedError(error)
    ) {
      return NextResponse.json<ContactsErrorResponse>(
        {
          error: "Reconnect this account to enable contact suggestions.",
          isKnownError: true,
          reconnectRequired: true,
        },
        { status: 403 },
      );
    }

    throw error;
  }

  return NextResponse.json(result);
});

async function getContacts(
  emailProvider: Pick<EmailProvider, "searchContacts">,
  query: string,
) {
  const contacts = await emailProvider.searchContacts(query);
  return { contacts };
}
