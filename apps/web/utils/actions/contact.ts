"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { describeError, SafeError } from "@/utils/error";
import { after } from "next/server";
import { z } from "zod";
import {
  createCompanyBody,
  deleteCompanyBody,
  mergeCompaniesBody,
  deleteCompanyLabelBody,
  deleteContactBody,
  enrichContactBody,
  extractContactsBody,
  researchCompanyBody,
  updateCompanyLabelBody,
  setCarddavAccessBody,
  setContactIgnoredBody,
  setContactInboxPriorityBody,
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
import {
  ContactInboxPriority,
  GoogleContactsSyncMode,
} from "@/generated/prisma/enums";
import { runWithBoundedConcurrency } from "@/utils/async";
import { isPublicEmailDomain } from "@/utils/email";
import { emailDomain } from "@/utils/contacts";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { aiEnrichContact } from "@/utils/ai/contacts/enrich-contact";
import { aiExtractContactsFromEmail } from "@/utils/ai/contacts/extract-contacts-from-email";
import { aiResearchCompany } from "@/utils/ai/companies/research-company";
import type { EmailForLLM } from "@/utils/types";
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
        phones,
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
        ...(phones !== undefined && { phones: cleanPhones(phones) }),
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

// Per-sender override of the rules engine: ALWAYS keeps their mail in the
// inbox no matter what the rules say; AI evaluates the saved instructions
// against each email and falls through to the rules when they don't apply.
export const setContactInboxPriorityAction = actionClient
  .metadata({ name: "setContactInboxPriority" })
  .inputSchema(setContactInboxPriorityBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { email, priority, instructions },
    }) => {
      const normalizedEmail = email.trim().toLowerCase();
      const details = {
        inboxPriority: priority,
        inboxPriorityInstructions:
          priority === ContactInboxPriority.AI
            ? (instructions?.trim() ?? null)
            : null,
      };

      await prisma.contact.upsert({
        where: {
          emailAccountId_email: { emailAccountId, email: normalizedEmail },
        },
        update: details,
        create: { emailAccountId, email: normalizedEmail, ...details },
      });

      return { email: normalizedEmail, priority };
    },
  );

// Scans an opened email's body for people (rosters, intro lists, forwarded
// signatures) so each can be added as a contact with one click. Returns the
// extracted people annotated with whether they're already saved.
export const extractContactsFromEmailAction = actionClient
  .metadata({ name: "extractContactsFromEmail" })
  .inputSchema(extractContactsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { from, subject, content },
    }) => {
      const emailAccount = await getEmailAccountWithAiAndTokens({
        emailAccountId,
      });
      if (!emailAccount) throw new SafeError("Email account not found");

      const result = await aiExtractContactsFromEmail({
        emailAccount,
        from,
        subject,
        content,
      });
      if (!result) throw new SafeError("Couldn't read this email");

      const people = result.people
        .map((person) => ({
          ...person,
          email: person.email.trim().toLowerCase(),
        }))
        .filter((person) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email));

      const existing = people.length
        ? await prisma.contact.findMany({
            where: {
              emailAccountId,
              email: { in: people.map((person) => person.email) },
            },
            select: { email: true },
          })
        : [];
      const saved = new Set(existing.map((contact) => contact.email));

      // Company membership is domain-authoritative — when a person's domain
      // already belongs to one of the user's companies, show and save that
      // company, not whatever name the email used (a mismatch would make
      // the add fail the domain-lock check)
      const domains = [
        ...new Set(
          people
            .map((person) => emailDomain(person.email))
            .filter(
              (domain): domain is string =>
                !!domain && !isPublicEmailDomain(domain),
            ),
        ),
      ];
      const owners = domains.length
        ? await prisma.company.findMany({
            where: { emailAccountId, domains: { hasSome: domains } },
            select: { name: true, domains: true },
            // Deterministic pick if two companies ever share a domain —
            // matches resolveLockedCompanyId
            orderBy: { createdAt: "asc" },
          })
        : [];
      const ownerByDomain = new Map<string, string>();
      for (const company of owners) {
        for (const domain of company.domains) {
          if (!ownerByDomain.has(domain)) {
            ownerByDomain.set(domain, company.name);
          }
        }
      }

      return {
        people: people.map((person) => {
          const domain = emailDomain(person.email);
          const ownerName = domain ? ownerByDomain.get(domain) : undefined;
          return {
            ...person,
            companyName: ownerName ?? person.companyName,
            alreadySaved: saved.has(person.email),
          };
        }),
      };
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
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { name, domains },
    }) => {
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

      // Fresh companies get researched in the background: the AI writes the
      // "who they are" summary and fixes the domain-derived name's
      // capitalization/spacing (700credit → 700Credit) while the user moves on
      const researching = !existing && normalized.length > 0;
      if (researching) {
        after(async () => {
          try {
            await runCompanyResearch({
              emailAccountId,
              companyId: company.id,
              provider,
              logger,
              renamePolicy: "default-name",
            });
          } catch (error) {
            logger.warn("Background company research failed", {
              companyId: company.id,
              error,
            });
          }
        });
      }

      return { company, researching };
    },
  );

// Renames a label and/or moves it under a different parent (null = top
// level). Companies keep pointing at the label, so their grouping follows.
export const updateCompanyLabelAction = actionClient
  .metadata({ name: "updateCompanyLabel" })
  .inputSchema(updateCompanyLabelBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { id, name, parentId },
    }) => {
      const label = await prisma.companyLabel.findFirst({
        where: { id, emailAccountId },
        select: { id: true },
      });
      if (!label) throw new SafeError("Label not found");

      const trimmedName = name?.trim();
      if (trimmedName) {
        const clash = await prisma.companyLabel.findFirst({
          where: {
            emailAccountId,
            name: { equals: trimmedName, mode: "insensitive" },
            id: { not: id },
          },
          select: { name: true },
        });
        if (clash) {
          throw new SafeError(`A label called ${clash.name} already exists`);
        }
      }

      if (parentId) {
        if (parentId === id) {
          throw new SafeError("A label can't be its own parent");
        }
        const parent = await prisma.companyLabel.findFirst({
          where: { id: parentId, emailAccountId },
          select: { parentId: true },
        });
        if (!parent) throw new SafeError("Parent label not found");
        // Two levels deep is the ceiling: nesting under a child would
        // create cycles or deeper trees the UI can't show
        if (parent.parentId === id) {
          throw new SafeError("A label can't be nested under its own child");
        }
        if (parent.parentId) {
          throw new SafeError(
            "Labels only nest one level deep — pick a top-level label as the parent",
          );
        }
        const child = await prisma.companyLabel.findFirst({
          where: { emailAccountId, parentId: id },
          select: { name: true },
        });
        if (child) {
          throw new SafeError(
            `This label has labels nested under it (e.g. ${child.name}) — move those out first`,
          );
        }
      }

      const updated = await prisma.companyLabel.update({
        where: { id },
        data: {
          ...(trimmedName && { name: trimmedName }),
          ...(parentId !== undefined && { parentId: parentId ?? null }),
        },
      });

      return { label: updated };
    },
  );

// Deleting a label unlabels its companies and promotes its children to the
// top level (both relations SetNull) — nothing else is removed.
export const deleteCompanyLabelAction = actionClient
  .metadata({ name: "deleteCompanyLabel" })
  .inputSchema(deleteCompanyLabelBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await prisma.companyLabel.deleteMany({ where: { id, emailAccountId } });
    return { deleted: true };
  });

// On-demand company research: who they are, what they do, and their
// properly formatted name — from the web (when available) plus the user's
// email history with the company's domains.
export const researchCompanyAction = actionClient
  .metadata({ name: "researchCompany" })
  .inputSchema(researchCompanyBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { id },
    }) => {
      const result = await runCompanyResearch({
        emailAccountId,
        companyId: id,
        provider,
        logger,
        // Manual research fixes pure formatting automatically; a genuinely
        // different name is only suggested, never forced
        renamePolicy: "formatting-only",
      });
      if (!result) {
        throw new SafeError(
          "Couldn't research this company — no web results or email history to learn from yet.",
        );
      }
      return result;
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

// Hides one address from the contacts list — for robots that slip past the
// automated-sender heuristics (or any address the user never wants to see).
// A saved Contact row stays (and keeps syncing) so restoring is lossless;
// only the list output is suppressed. Restorable from the Suggested view.
export const setContactIgnoredAction = actionClient
  .metadata({ name: "setContactIgnored" })
  .inputSchema(setContactIgnoredBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { email, ignored } }) => {
      const normalized = email.trim().toLowerCase();

      if (ignored) {
        await prisma.$executeRaw`
          UPDATE "EmailAccount"
          SET "ignoredContactEmails" = (
            SELECT COALESCE(array_agg(DISTINCT e), ARRAY[]::text[])
            FROM unnest(array_append("ignoredContactEmails", ${normalized})) AS e
          )
          WHERE id = ${emailAccountId}`;
      } else {
        await prisma.$executeRaw`
          UPDATE "EmailAccount"
          SET "ignoredContactEmails" = array_remove("ignoredContactEmails", ${normalized})
          WHERE id = ${emailAccountId}`;
      }

      return { email: normalized, ignored };
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

function cleanPhones(
  phones: { label: string; value: string }[],
): { label: string; value: string }[] {
  return phones
    .map((phone) => ({
      label: phone.label.trim() || "Other",
      value: phone.value.trim(),
    }))
    .filter((phone) => phone.value);
}

// Shared by the research action and the create-company background hook.
// Saves the AI summary; renames per policy — "formatting-only" only fixes
// capitalization/spacing of the current name, "default-name" additionally
// trusts the AI when the current name is just the domain string.
async function runCompanyResearch({
  emailAccountId,
  companyId,
  provider,
  logger,
  renamePolicy,
}: {
  emailAccountId: string;
  companyId: string;
  provider: string;
  logger: Logger;
  renamePolicy: "formatting-only" | "default-name";
}): Promise<{
  summary: string;
  suggestedName: string | null;
  renamed: boolean;
  suggestedLabel: {
    name: string;
    parentName: string | null;
    isNew: boolean;
  } | null;
} | null> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, emailAccountId },
    select: { id: true, name: true, domains: true, labelId: true },
  });
  if (!company) throw new SafeError("Company not found");

  const emailAccount = await getEmailAccountWithAiAndTokens({
    emailAccountId,
  });
  if (!emailAccount) throw new SafeError("Email account not found");

  // Recent mail from the company's domain grounds the summary in the real
  // relationship (Gmail's from: accepts a bare domain)
  let emails: EmailForLLM[] = [];
  if (company.domains.length) {
    try {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      const { messages } = await emailProvider.getMessagesFromSender({
        senderEmail: company.domains[0],
        maxResults: 10,
      });
      emails = messages.map((message) =>
        getEmailForLLM(message, { removeForwarded: true, maxLength: 1000 }),
      );
    } catch (error) {
      logger.warn("Couldn't load email history for company research", {
        companyId,
        error,
      });
    }
  }

  // The label structure lets the AI file the company (or notice a gap and
  // propose a new sub-label)
  const labelRows = await prisma.companyLabel.findMany({
    where: { emailAccountId },
    select: { id: true, name: true, parentId: true },
    orderBy: { name: "asc" },
  });
  const labelNameById = new Map(labelRows.map((row) => [row.id, row.name]));

  const result = await aiResearchCompany({
    emailAccount,
    companyName: company.name,
    domains: company.domains,
    emails,
    labels: labelRows.map((row) => ({
      name: row.name,
      parentName: row.parentId
        ? (labelNameById.get(row.parentId) ?? null)
        : null,
    })),
    logger,
  });
  if (!result) return null;

  const aiName = result.name?.trim() || null;
  let renamed = false;

  if (aiName && aiName !== company.name) {
    const formattingOnly = companyNamesEquivalent(aiName, company.name);
    const isDefaultName = company.domains.some((domain) =>
      domain
        .split(".")
        .some((part) => companyNamesEquivalent(company.name, part)),
    );
    const shouldRename =
      formattingOnly || (renamePolicy === "default-name" && isDefaultName);

    if (shouldRename) {
      // Company names are unique per account — never rename into a clash
      const conflict = await prisma.company.findFirst({
        where: {
          emailAccountId,
          name: { equals: aiName, mode: "insensitive" },
          id: { not: company.id },
        },
        select: { id: true },
      });
      if (!conflict) {
        await prisma.company.update({
          where: { id: company.id },
          data: { name: aiName, aiSummary: result.summary },
        });
        renamed = true;
        logger.info("Company renamed from research", {
          companyId,
          from: company.name,
          to: aiName,
        });
      }
    }
  }

  if (!renamed) {
    await prisma.company.update({
      where: { id: company.id },
      data: { aiSummary: result.summary },
    });
  }

  // Label suggestion: an existing label auto-applies only in the background
  // create flow on an unlabeled company; everything else surfaces as a
  // suggestion the user applies explicitly
  const suggestion = result.label ?? null;
  const existingLabel = suggestion
    ? (labelRows.find(
        (row) => row.name.toLowerCase() === suggestion.name.toLowerCase(),
      ) ?? null)
    : null;
  let labelApplied = false;
  if (
    suggestion &&
    existingLabel &&
    renamePolicy === "default-name" &&
    !company.labelId
  ) {
    await prisma.company.update({
      where: { id: company.id },
      data: { labelId: existingLabel.id },
    });
    labelApplied = true;
    logger.info("Company labeled from research", {
      companyId,
      labelId: existingLabel.id,
    });
  }

  const suggestedLabel =
    suggestion && !labelApplied && existingLabel?.id !== company.labelId
      ? {
          name: existingLabel?.name ?? suggestion.name.trim(),
          parentName: existingLabel
            ? existingLabel.parentId
              ? (labelNameById.get(existingLabel.parentId) ?? null)
              : null
            : suggestion.parentName?.trim() || null,
          isNew: !existingLabel,
        }
      : null;

  return {
    summary: result.summary,
    suggestedName: aiName,
    renamed,
    suggestedLabel,
  };
}

// "700credit" vs "700Credit" vs "700 Credit" — same company, different
// formatting. Compares with case/spacing/punctuation stripped.
function companyNamesEquivalent(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const left = normalize(a);
  return !!left && left === normalize(b);
}
