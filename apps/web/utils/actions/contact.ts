"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { describeError, SafeError } from "@/utils/error";
import { after } from "next/server";
import { z } from "zod";
import {
  createCompanyBody,
  deleteCompanyBody,
  mergeCompaniesBody,
  deleteContactBody,
  enrichContactBody,
  setCarddavAccessBody,
  setDomainIgnoredBody,
  setGoogleContactsSyncBody,
  updateCompanyBody,
  updateContactBody,
} from "@/utils/actions/contact.validation";
import {
  generateCarddavPassword,
  hashCarddavPassword,
} from "@/utils/carddav/auth";
import {
  deleteGoogleContact,
  pullGoogleContacts,
  pushContactToGoogle,
} from "@/utils/contacts-sync/google";
import type { Logger } from "@/utils/logger";
import { GoogleContactsSyncMode } from "@/generated/prisma/enums";
import { runWithBoundedConcurrency } from "@/utils/async";
import { isPublicEmailDomain } from "@/utils/email";
import { emailDomain } from "@/utils/contacts";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { aiEnrichContact } from "@/utils/ai/contacts/enrich-contact";
import prisma from "@/utils/prisma";

export const updateContactAction = actionClient
  .metadata({ name: "updateContact" })
  .inputSchema(updateContactBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: {
        email,
        name,
        title,
        phone,
        notes,
        photoUrl,
        useCompanyLogo,
        isPersonal,
        companyName,
      },
    }) => {
      const normalizedEmail = email.trim().toLowerCase();

      // Only touch fields the caller sent, so partial updates can't wipe
      // previously saved details
      const details = {
        ...(name !== undefined && { name: name?.trim() || null }),
        ...(title !== undefined && { title: title?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(photoUrl !== undefined && { photoUrl: photoUrl?.trim() || null }),
        ...(useCompanyLogo !== undefined && { useCompanyLogo }),
        ...(isPersonal !== undefined && { isPersonal }),
        ...(companyName !== undefined && {
          companyId: await resolveLockedCompanyId({
            emailAccountId,
            companyName,
            contactEmail: normalizedEmail,
          }),
        }),
      };

      const contact = await prisma.contact.upsert({
        where: {
          emailAccountId_email: { emailAccountId, email: normalizedEmail },
        },
        update: details,
        create: { emailAccountId, email: normalizedEmail, ...details },
      });

      await maybePushToGoogle({
        emailAccountId,
        email: normalizedEmail,
        logger,
      });

      return { contact };
    },
  );

// Removes the saved details for a contact. The person still appears in the
// list while email history with them exists — only the Contact row goes away.
export const deleteContactAction = actionClient
  .metadata({ name: "deleteContact" })
  .inputSchema(deleteContactBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { email } }) => {
      const normalizedEmail = email.trim().toLowerCase();

      const contact = await prisma.contact.findUnique({
        where: {
          emailAccountId_email: { emailAccountId, email: normalizedEmail },
        },
        select: { googleResourceName: true },
      });

      await prisma.contact.deleteMany({
        where: { emailAccountId, email: normalizedEmail },
      });

      // Two-way sync: without this the hourly pull resurrects the contact,
      // and a later re-save would create a duplicate Google person. In PULL
      // mode nothing is deleted from Google (one-way by design).
      if (contact?.googleResourceName) {
        const account = await prisma.emailAccount.findUnique({
          where: { id: emailAccountId },
          select: { googleContactsSyncMode: true },
        });
        if (
          account?.googleContactsSyncMode === GoogleContactsSyncMode.TWO_WAY
        ) {
          const resourceName = contact.googleResourceName;
          after(async () => {
            try {
              await deleteGoogleContact({
                emailAccountId,
                resourceName,
                logger,
              });
            } catch (error) {
              logger.warn("Failed to delete contact from Google", {
                email: normalizedEmail,
                error,
              });
            }
          });
        }
      }

      return { deleted: true };
    },
  );

// Sets the Google Contacts sync mode. PULL is a one-way import (Google →
// here, nothing pushed back) so contacts can be brought in and enriched
// safely; TWO_WAY adds pushing local edits/deletes back to Google.
export const setGoogleContactsSyncAction = actionClient
  .metadata({ name: "setGoogleContactsSync" })
  .inputSchema(setGoogleContactsSyncBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { mode } }) => {
      const previous = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: { googleContactsSyncMode: true },
      });

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { googleContactsSyncMode: mode },
      });

      // Entering two-way pushes everything saved locally to Google once, so
      // details enriched while push was off (or before sync existed) land
      // there too — after that, pushes happen per save
      if (
        mode === GoogleContactsSyncMode.TWO_WAY &&
        previous?.googleContactsSyncMode !== GoogleContactsSyncMode.TWO_WAY
      ) {
        after(() => pushAllSavedContactsToGoogle({ emailAccountId, logger }));
      }

      if (mode !== GoogleContactsSyncMode.OFF) {
        const result = await pullGoogleContacts({ emailAccountId, logger });
        return { mode, ...result };
      }

      return { mode };
    },
  );

// Enables CardDAV access (iOS/macOS Contacts) by generating an app
// password. The plaintext is returned exactly once; only its hash is stored.
export const setCarddavAccessAction = actionClient
  .metadata({ name: "setCarddavAccess" })
  .inputSchema(setCarddavAccessBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { enabled } }) => {
    if (!enabled) {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { carddavPasswordHash: null },
      });
      return { enabled: false as const };
    }

    const password = generateCarddavPassword();
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { carddavPasswordHash: hashCarddavPassword(password) },
    });

    return { enabled: true as const, password };
  });

// Manual "Sync now" — pulls from Google immediately
export const syncGoogleContactsAction = actionClient
  .metadata({ name: "syncGoogleContacts" })
  .inputSchema(z.object({}))
  .action(async ({ ctx: { emailAccountId, logger } }) => {
    const result = await pullGoogleContacts({ emailAccountId, logger });
    return result;
  });

// Reads the contact's recent emails and returns suggested details (name,
// title, company, phones) for the user to review; only the AI relationship
// summary is saved directly.
export const enrichContactAction = actionClient
  .metadata({ name: "enrichContact" })
  .inputSchema(enrichContactBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { email },
    }) => {
      const normalizedEmail = email.trim().toLowerCase();

      const emailAccount = await getEmailAccountWithAiAndTokens({
        emailAccountId,
      });
      if (!emailAccount) throw new SafeError("Email account not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const { messages } = await emailProvider.getMessagesFromSender({
        senderEmail: normalizedEmail,
        maxResults: 10,
      });

      if (!messages.length) {
        throw new SafeError(
          "No emails from this contact to learn from yet. Details can only be extracted from their emails.",
        );
      }

      const contact = await prisma.contact.findUnique({
        where: {
          emailAccountId_email: { emailAccountId, email: normalizedEmail },
        },
        select: { name: true },
      });

      try {
        const result = await aiEnrichContact({
          emailAccount,
          contactEmail: normalizedEmail,
          contactName: contact?.name,
          emails: messages.map((message) =>
            getEmailForLLM(message, { removeForwarded: true, maxLength: 2000 }),
          ),
        });
        if (!result) throw new SafeError("Could not analyze this contact");

        // The summary is the AI's own output — save it; extracted details
        // are suggestions the user applies explicitly
        await prisma.contact.upsert({
          where: {
            emailAccountId_email: { emailAccountId, email: normalizedEmail },
          },
          update: { aiSummary: result.summary },
          create: {
            emailAccountId,
            email: normalizedEmail,
            aiSummary: result.summary,
          },
        });

        return {
          suggestions: {
            name: result.name,
            title: result.title,
            company: result.company,
            phones: result.phones,
          },
          summary: result.summary,
        };
      } catch (error) {
        if (error instanceof SafeError) throw error;
        logger.error("Error enriching contact", { error });
        throw new SafeError(
          `Could not analyze this contact's emails: ${describeError(error)}`,
        );
      }
    },
  );

// Materializes an auto domain group (or creates a fresh company); merging
// domains keeps re-saving idempotent
export const createCompanyAction = actionClient
  .metadata({ name: "createCompany" })
  .inputSchema(createCompanyBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { name, domains } }) => {
      const trimmedName = name.trim();
      const normalized = normalizeDomains(domains ?? []);

      const existing = await prisma.company.findUnique({
        where: { emailAccountId_name: { emailAccountId, name: trimmedName } },
      });

      await assertDomainsUnowned({
        emailAccountId,
        domains: normalized,
        excludeCompanyId: existing?.id,
      });

      const company = existing
        ? await prisma.company.update({
            where: { id: existing.id },
            data: {
              domains: [...new Set([...existing.domains, ...normalized])],
            },
          })
        : await prisma.company.create({
            data: { emailAccountId, name: trimmedName, domains: normalized },
          });

      return { company };
    },
  );

// Hides a domain from (or restores it to) the Suggested companies list.
// Atomic single-statement updates so rapid-fire ignores don't lose each
// other to a read-modify-write race.
export const setDomainIgnoredAction = actionClient
  .metadata({ name: "setDomainIgnored" })
  .inputSchema(setDomainIgnoredBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { domain, ignored } }) => {
      const [normalized] = normalizeDomains([domain]);
      if (!normalized) throw new SafeError("Invalid domain");

      if (ignored) {
        await prisma.$executeRaw`
          UPDATE "EmailAccount"
          SET "ignoredContactDomains" = (
            SELECT COALESCE(array_agg(DISTINCT d), ARRAY[]::text[])
            FROM unnest(array_append("ignoredContactDomains", ${normalized})) AS d
          )
          WHERE id = ${emailAccountId}`;
      } else {
        await prisma.$executeRaw`
          UPDATE "EmailAccount"
          SET "ignoredContactDomains" = array_remove("ignoredContactDomains", ${normalized})
          WHERE id = ${emailAccountId}`;
      }

      return { domain: normalized, ignored };
    },
  );

export const updateCompanyAction = actionClient
  .metadata({ name: "updateCompany" })
  .inputSchema(updateCompanyBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: {
        id,
        name,
        domains,
        logoUrl,
        logoWhiteBackground,
        labelName,
        labelParentName,
      },
    }) => {
      const existing = await prisma.company.findFirst({
        where: { id, emailAccountId },
      });
      if (!existing) throw new SafeError("Company not found");

      const normalizedDomains =
        domains !== undefined ? normalizeDomains(domains) : undefined;
      if (normalizedDomains !== undefined) {
        await assertDomainsUnowned({
          emailAccountId,
          domains: normalizedDomains,
          excludeCompanyId: id,
        });
      }

      const company = await prisma.company.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(normalizedDomains !== undefined && {
            domains: normalizedDomains,
          }),
          ...(logoUrl !== undefined && { logoUrl: logoUrl?.trim() || null }),
          ...(logoWhiteBackground !== undefined && { logoWhiteBackground }),
          ...(labelName !== undefined && {
            labelId: await resolveLabelId({
              emailAccountId,
              labelName,
              labelParentName,
            }),
          }),
        },
      });

      return { company };
    },
  );

// Deleting a company clears its contacts' membership (onDelete: SetNull);
// their domains fall back to auto grouping and the Suggested view
export const deleteCompanyAction = actionClient
  .metadata({ name: "deleteCompany" })
  .inputSchema(deleteCompanyBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await prisma.company.deleteMany({ where: { id, emailAccountId } });
    return { deleted: true };
  });

// Absorbs one company into another: explicit members and domains move to
// the target, then the source is deleted. The target keeps its own name,
// logo, and label; gaps are filled from the source.
export const mergeCompaniesAction = actionClient
  .metadata({ name: "mergeCompanies" })
  .inputSchema(mergeCompaniesBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { sourceId, targetId },
    }) => {
      if (sourceId === targetId) {
        throw new SafeError("Pick a different company to merge into");
      }

      const [source, target] = await Promise.all([
        prisma.company.findFirst({ where: { id: sourceId, emailAccountId } }),
        prisma.company.findFirst({ where: { id: targetId, emailAccountId } }),
      ]);
      if (!source || !target) throw new SafeError("Company not found");

      // One transaction so the one-owner-per-domain invariant holds: the
      // source is gone before its domains land on the target
      await prisma.$transaction([
        prisma.contact.updateMany({
          where: { emailAccountId, companyId: sourceId },
          data: { companyId: targetId },
        }),
        prisma.company.delete({ where: { id: sourceId } }),
        prisma.company.update({
          where: { id: targetId },
          data: {
            domains: [...new Set([...target.domains, ...source.domains])],
            ...(!target.logoUrl && source.logoUrl
              ? { logoUrl: source.logoUrl }
              : {}),
            ...(!target.labelId && source.labelId
              ? { labelId: source.labelId }
              : {}),
            ...(!target.logoWhiteBackground && source.logoWhiteBackground
              ? { logoWhiteBackground: true }
              : {}),
          },
        }),
      ]);

      return { merged: true, targetId };
    },
  );

// Company membership is domain-authoritative: when a contact's email
// domain already belongs to a company, their company can't be changed per
// contact — edit the company's domain list (or mark the contact personal)
// instead. This also means reassigning one person can never silently move
// everyone else on their domain.
async function resolveLockedCompanyId({
  emailAccountId,
  companyName,
  contactEmail,
}: {
  emailAccountId: string;
  companyName: string | null | undefined;
  contactEmail: string;
}): Promise<string | null> {
  // Blank always means "no explicit assignment" — domain grouping (or the
  // personal flag) takes over, so plain adds at owned domains keep working
  const name = companyName?.trim();
  if (!name) return null;

  const domain = emailDomain(contactEmail);

  if (domain && !isPublicEmailDomain(domain)) {
    const owner = await prisma.company.findFirst({
      where: { emailAccountId, domains: { has: domain } },
      select: { id: true, name: true },
      // Deterministic pick if two companies ever share a domain
      orderBy: { createdAt: "asc" },
    });

    if (owner) {
      if (name.toLowerCase() === owner.name.toLowerCase()) return owner.id;
      throw new SafeError(
        `${owner.name} owns the ${domain} domain, so this contact's company is set automatically. Edit ${owner.name}'s domains to change that, or mark the contact as personal.`,
      );
    }
  }

  return resolveCompanyId({ emailAccountId, companyName, contactEmail });
}

// Assigning a contact to a company also teaches the company the contact's
// email domain, so everyone else on that domain groups with it automatically
async function resolveCompanyId({
  emailAccountId,
  companyName,
  contactEmail,
}: {
  emailAccountId: string;
  companyName: string | null | undefined;
  contactEmail: string;
}): Promise<string | null> {
  const name = companyName?.trim();
  if (!name) return null;

  const domain = emailDomain(contactEmail);
  const adoptDomain = !!domain && !isPublicEmailDomain(domain);

  // Match existing companies case-insensitively so typing "toyota" joins
  // Toyota instead of creating a duplicate
  const company =
    (await prisma.company.findFirst({
      where: { emailAccountId, name: { equals: name, mode: "insensitive" } },
    })) ??
    (await prisma.company.create({
      data: {
        emailAccountId,
        name,
        domains: adoptDomain ? [domain] : [],
      },
    }));

  if (adoptDomain && !company.domains.includes(domain)) {
    await prisma.company.update({
      where: { id: company.id },
      data: { domains: [...company.domains, domain] },
    });
  }

  return company.id;
}

async function resolveLabelId({
  emailAccountId,
  labelName,
  labelParentName,
}: {
  emailAccountId: string;
  labelName: string | null | undefined;
  labelParentName: string | null | undefined;
}): Promise<string | null> {
  const name = labelName?.trim();
  if (!name) return null;

  const parentName = labelParentName?.trim();
  const parent = parentName
    ? await prisma.companyLabel.upsert({
        where: { emailAccountId_name: { emailAccountId, name: parentName } },
        update: {},
        create: { emailAccountId, name: parentName },
      })
    : null;

  // A cleared parent field (empty string) must un-nest the label; only an
  // omitted field (undefined) leaves the existing parent untouched
  const parentUpdate =
    labelParentName === undefined ? {} : { parentId: parent?.id ?? null };

  const label = await prisma.companyLabel.upsert({
    where: { emailAccountId_name: { emailAccountId, name } },
    update: parentUpdate,
    create: { emailAccountId, name, parentId: parent?.id },
  });

  return label.id;
}

// Fire-and-forget push of a saved contact to Google when sync is on —
// a Google hiccup must never fail the local save
async function maybePushToGoogle({
  emailAccountId,
  email,
  logger,
}: {
  emailAccountId: string;
  email: string;
  logger: Logger;
}) {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { googleContactsSyncMode: true },
  });
  // PULL is one-way by design — local edits never leave
  if (account?.googleContactsSyncMode !== GoogleContactsSyncMode.TWO_WAY) {
    return;
  }

  after(async () => {
    try {
      await pushContactToGoogle({ emailAccountId, email, logger });
    } catch (error) {
      logger.warn("Failed to push contact to Google", { email, error });
    }
  });
}

// The one-time backfill when two-way sync turns on: every saved contact is
// pushed so Google catches up with local edits made while push was off
async function pushAllSavedContactsToGoogle({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const saved = await prisma.contact.findMany({
    where: { emailAccountId },
    select: { email: true },
  });

  let pushed = 0;
  let failed = 0;
  await runWithBoundedConcurrency({
    items: saved,
    concurrency: 3,
    run: async (contact) => {
      try {
        await pushContactToGoogle({
          emailAccountId,
          email: contact.email,
          logger,
        });
        pushed++;
      } catch (error) {
        failed++;
        logger.warn("Failed to push contact to Google", {
          email: contact.email,
          error,
        });
      }
    },
  });

  logger.info("Initial two-way sync push finished", {
    total: saved.length,
    pushed,
    failed,
  });
}

// A domain belongs to exactly one company, so client display (first match)
// and the server lock (oldest owner) can never disagree. Reject a save that
// would let a second company claim a domain another already owns.
async function assertDomainsUnowned({
  emailAccountId,
  domains,
  excludeCompanyId,
}: {
  emailAccountId: string;
  domains: string[];
  excludeCompanyId?: string;
}): Promise<void> {
  if (!domains.length) return;
  const conflict = await prisma.company.findFirst({
    where: {
      emailAccountId,
      domains: { hasSome: domains },
      ...(excludeCompanyId && { id: { not: excludeCompanyId } }),
    },
    select: { name: true, domains: true },
  });
  if (!conflict) return;
  const clash = domains.find((domain) => conflict.domains.includes(domain));
  throw new SafeError(
    `${conflict.name} already owns ${clash}. Remove it from ${conflict.name} first, or add those contacts to ${conflict.name}.`,
  );
}

function normalizeDomains(domains: string[]): string[] {
  return [
    ...new Set(
      domains
        .map((domain) =>
          domain
            .trim()
            .toLowerCase()
            .replace(/^@/, "")
            .replace(/^www\./, ""),
        )
        .filter(Boolean),
    ),
  ];
}
