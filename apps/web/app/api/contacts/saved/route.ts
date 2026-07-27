import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type SavedContactsResponse = Awaited<ReturnType<typeof getSaved>>;

const MAX_EMAILS = 100;

// Which of these email addresses are already saved contacts — a targeted
// membership check so the mail view can gate "add to contacts" offers
// without loading the whole contact list.
export const GET = withEmailAccount("contacts", async (request) => {
  const { emailAccountId } = request.auth;
  const emailsParam = request.nextUrl.searchParams.get("emails")?.trim() ?? "";
  const emails = [
    ...new Set(
      emailsParam
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, MAX_EMAILS);

  const result = await getSaved({ emailAccountId, emails });
  return NextResponse.json(result);
});

async function getSaved({
  emailAccountId,
  emails,
}: {
  emailAccountId: string;
  emails: string[];
}) {
  if (!emails.length) return { saved: [] as string[] };

  const contacts = await prisma.contact.findMany({
    where: { emailAccountId, email: { in: emails } },
    select: { email: true },
  });

  return { saved: contacts.map((contact) => contact.email) };
}
