import { z } from "zod";
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { mergeContactActivity } from "@/utils/contacts";
import { queryContactActivity } from "@/utils/contacts-activity";

const querySchema = z.object({
  search: z.string().optional(),
  sort: z.enum(["recent", "frequent"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type ContactsResponse = Awaited<ReturnType<typeof getContacts>>;

export const GET = withEmailAccount("contacts", async (request) => {
  const { emailAccountId, email: userEmail } = request.auth;
  const { searchParams } = new URL(request.url);
  const query = querySchema.parse({
    search: searchParams.get("search") || undefined,
    sort: searchParams.get("sort") || undefined,
    limit: searchParams.get("limit") || undefined,
  });

  const result = await getContacts({ emailAccountId, userEmail, ...query });

  return NextResponse.json(result);
});

// People you've exchanged email with, aggregated from the EmailMessage cache
// (senders of received mail + recipients of sent mail), overlaid with any
// user-saved Contact details.
async function getContacts({
  emailAccountId,
  userEmail,
  search,
  sort,
  limit,
}: {
  emailAccountId: string;
  userEmail: string;
  search?: string;
  sort: "recent" | "frequent";
  limit: number;
}) {
  const searchTerm = search?.trim().toLowerCase();

  const activity = await queryContactActivity({
    emailAccountId,
    userEmail,
    searchTerm,
    sort,
    limit,
  });
  const hasMore = activity.length === limit;

  const saved = await prisma.contact.findMany({
    where: { emailAccountId },
    select: {
      email: true,
      name: true,
      title: true,
      phone: true,
      notes: true,
      aiSummary: true,
      photoUrl: true,
      useCompanyLogo: true,
      isPersonal: true,
      companyId: true,
    },
  });

  // Saved contacts whose activity fell outside the search/limit window would
  // otherwise show zeroed stats — fetch their aggregates directly
  const foundEmails = new Set(activity.map((entry) => entry.email));
  const missingEmails = saved
    .map((contact) => contact.email.toLowerCase())
    .filter((email) => !foundEmails.has(email));
  if (missingEmails.length) {
    activity.push(
      ...(await queryContactActivity({
        emailAccountId,
        userEmail,
        emails: missingEmails,
      })),
    );
  }

  const companies = await prisma.company.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      name: true,
      domains: true,
      logoUrl: true,
      logoWhiteBackground: true,
      label: {
        select: {
          id: true,
          name: true,
          parent: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
  const contacts = mergeContactActivity({ activity, saved }).filter(
    (contact) =>
      !searchTerm ||
      contact.email.includes(searchTerm) ||
      contact.name?.toLowerCase().includes(searchTerm) ||
      (contact.companyId &&
        companyNameById
          .get(contact.companyId)
          ?.toLowerCase()
          .includes(searchTerm)),
  );

  const syncState = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      googleContactsSyncMode: true,
      googleContactsSyncedAt: true,
      carddavPasswordHash: true,
      ignoredContactDomains: true,
      account: { select: { provider: true } },
    },
  });

  return {
    contacts,
    companies,
    hasMore,
    ignoredDomains: syncState?.ignoredContactDomains ?? [],
    sync: {
      provider: syncState?.account.provider ?? null,
      googleMode: syncState?.googleContactsSyncMode ?? "OFF",
      googleSyncedAt: syncState?.googleContactsSyncedAt ?? null,
      carddavEnabled: !!syncState?.carddavPasswordHash,
    },
  };
}
