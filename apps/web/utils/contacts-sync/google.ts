import type { people_v1 } from "@googleapis/people";
import { getContactsClientWithRefresh } from "@/utils/gmail/client";
import {
  contactToPersonPayload,
  mapPersonToContact,
  PERSON_FIELDS,
  UPDATE_PERSON_FIELDS,
} from "@/utils/contacts-sync/mappers";
import type { ContactPhone } from "@/utils/contacts";
import type { Logger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

const PAGE_SIZE = 200;

export type PullResult = {
  created: number;
  updated: number;
  deleted: number;
  // People Google returned that carried nothing identifying. Counted so a
  // contact going missing is visible in the logs instead of silent.
  skipped: number;
};

// Pulls Google Contacts into Contact rows. Incremental when a sync token is
// stored; falls back to a full sync when Google reports the token expired.
//
// A stored token only replays what changed since it was issued, so anyone the
// previous pull skipped stays invisible forever — Google has no reason to send
// them again. Pass full: true when the caller means "fetch everything", which
// is what someone clicking Sync because a contact is missing wants.
export async function pullGoogleContacts({
  emailAccountId,
  full = false,
  logger,
}: {
  emailAccountId: string;
  full?: boolean;
  logger: Logger;
}): Promise<PullResult> {
  const client = await getPeopleClient({ emailAccountId, logger });

  const account = full
    ? null
    : await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: { googleContactsSyncToken: true },
      });

  try {
    return await pullWithToken({
      client,
      emailAccountId,
      syncToken: account?.googleContactsSyncToken ?? null,
      logger,
    });
  } catch (error) {
    if (isExpiredSyncTokenError(error)) {
      logger.info("Google contacts sync token expired, running full sync", {
        emailAccountId,
      });
      return await pullWithToken({
        client,
        emailAccountId,
        syncToken: null,
        logger,
      });
    }
    throw translateGoogleError(error);
  }
}

// Pushes one contact's core fields to Google (create or update)
export async function pushContactToGoogle({
  emailAccountId,
  email,
  logger,
}: {
  emailAccountId: string;
  email: string;
  logger: Logger;
}): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { emailAccountId_email: { emailAccountId, email } },
    select: {
      id: true,
      email: true,
      name: true,
      phones: true,
      title: true,
      googleResourceName: true,
      googleEtag: true,
      company: { select: { name: true } },
    },
  });
  if (!contact) return;

  const client = await getPeopleClient({ emailAccountId, logger });
  const payload = contactToPersonPayload({
    email: contact.email,
    name: contact.name,
    phones: (contact.phones ?? []) as ContactPhone[],
    title: contact.title,
    companyName: contact.company?.name,
  });

  try {
    if (contact.googleResourceName) {
      // Google requires the current etag; re-fetch once if ours is stale
      const etag =
        contact.googleEtag ??
        (
          await client.people.get({
            resourceName: contact.googleResourceName,
            personFields: PERSON_FIELDS,
          })
        ).data.etag;

      const { data } = await client.people.updateContact({
        resourceName: contact.googleResourceName,
        updatePersonFields: UPDATE_PERSON_FIELDS,
        requestBody: { ...payload, etag },
      });
      await prisma.contact.update({
        where: { id: contact.id },
        data: { googleEtag: data.etag ?? null },
      });
    } else {
      const { data } = await client.people.createContact({
        personFields: PERSON_FIELDS,
        requestBody: payload,
      });
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          googleResourceName: data.resourceName ?? null,
          googleEtag: data.etag ?? null,
        },
      });
    }
  } catch (error) {
    throw translateGoogleError(error);
  }
}

// Deletes the linked Google person. Two-way sync: without this a local
// delete would resurrect on the next pull.
export async function deleteGoogleContact({
  emailAccountId,
  resourceName,
  logger,
}: {
  emailAccountId: string;
  resourceName: string;
  logger: Logger;
}): Promise<void> {
  const client = await getPeopleClient({ emailAccountId, logger });
  try {
    await client.people.deleteContact({ resourceName });
  } catch (error) {
    throw translateGoogleError(error);
  }
}

async function pullWithToken({
  client,
  emailAccountId,
  syncToken,
  logger,
}: {
  client: people_v1.People;
  emailAccountId: string;
  syncToken: string | null;
  logger: Logger;
}): Promise<PullResult> {
  const result: PullResult = { created: 0, updated: 0, deleted: 0, skipped: 0 };
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const { data } = await client.people.connections.list({
      resourceName: "people/me",
      personFields: PERSON_FIELDS,
      pageSize: PAGE_SIZE,
      requestSyncToken: true,
      ...(syncToken ? { syncToken } : {}),
      ...(pageToken ? { pageToken } : {}),
    });

    for (const person of data.connections ?? []) {
      const mapped = mapPersonToContact(person);
      if (!mapped) {
        result.skipped += 1;
        logger.trace("Skipped a Google person with nothing identifying", {
          resourceName: person.resourceName,
        });
        continue;
      }

      if (mapped.deleted) {
        const { count } = await prisma.contact.deleteMany({
          where: { emailAccountId, googleResourceName: mapped.resourceName },
        });
        result.deleted += count;
        continue;
      }

      // Prefer the Google link; fall back to email so re-syncs don't
      // duplicate contacts that existed before sync was enabled. A
      // phone-only person has no email to fall back to.
      const existing =
        (await prisma.contact.findFirst({
          where: { emailAccountId, googleResourceName: mapped.resourceName },
          select: { id: true },
        })) ??
        (mapped.email
          ? await prisma.contact.findUnique({
              where: {
                emailAccountId_email: { emailAccountId, email: mapped.email },
              },
              select: { id: true },
            })
          : null);

      // Google's version wins for the fields it owns; Zerrow-only fields
      // (notes, aiSummary, company assignment, personal flag) are untouched
      const googleFields = {
        name: mapped.name,
        phones: mapped.phones,
        title: mapped.title,
        ...(mapped.photoUrl ? { photoUrl: mapped.photoUrl } : {}),
        googleResourceName: mapped.resourceName,
        googleEtag: mapped.etag,
      };

      if (existing) {
        await prisma.contact.update({
          where: { id: existing.id },
          data: googleFields,
        });
        result.updated += 1;
      } else {
        await prisma.contact.create({
          data: { emailAccountId, email: mapped.email, ...googleFields },
        });
        result.created += 1;
      }
    }

    nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: {
      googleContactsSyncToken: nextSyncToken,
      googleContactsSyncedAt: new Date(),
    },
  });

  logger.info("Google contacts pulled", { emailAccountId, ...result });

  return result;
}

async function getPeopleClient({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}): Promise<people_v1.People> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          provider: true,
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
    },
  });
  if (!account) throw new SafeError("Email account not found");
  if (account.account.provider !== "google") {
    throw new SafeError("Google Contacts sync requires a Google account");
  }

  return getContactsClientWithRefresh({
    accessToken: account.account.access_token,
    refreshToken: account.account.refresh_token,
    expiresAt: account.account.expires_at?.getTime() ?? null,
    emailAccountId,
    logger,
  });
}

function isExpiredSyncTokenError(error: unknown): boolean {
  const gaxios = error as {
    response?: { status?: number; data?: { error?: { status?: string } } };
  };
  return (
    gaxios.response?.status === 400 &&
    gaxios.response.data?.error?.status === "FAILED_PRECONDITION"
  );
}

// Missing People scope is the most common failure — make it actionable
function translateGoogleError(error: unknown): unknown {
  const gaxios = error as { response?: { status?: number } };
  if (gaxios.response?.status === 403) {
    return new SafeError(
      "Google hasn't granted contacts access for this account. Sign out and sign in again to grant the Contacts permission (requires NEXT_PUBLIC_CONTACTS_ENABLED).",
    );
  }
  return error;
}
