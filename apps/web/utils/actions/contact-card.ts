"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  resolveContactCardExchangeBody,
  sendMyCardBody,
  upsertContactCardBody,
} from "@/utils/actions/contact-card.validation";
import { ContactCardExchangeStatus } from "@/generated/prisma/enums";
import { normalizeCardSlug } from "@/utils/contact-card/slug";
import { getContactCardUrl } from "@/utils/contact-card/url";
import { createEmailProvider } from "@/utils/email/provider";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";

export const upsertContactCardAction = actionClient
  .metadata({ name: "upsertContactCard" })
  .inputSchema(upsertContactCardBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const slug = normalizeCardSlug(parsedInput.slug);
    if (slug.length < 3) {
      throw new SafeError(
        "Choose a link with at least 3 letters or numbers in it",
      );
    }

    const fields = {
      slug,
      isActive: parsedInput.isActive,
      displayName: parsedInput.displayName.trim(),
      headline: blankToNull(parsedInput.headline),
      title: blankToNull(parsedInput.title),
      companyName: blankToNull(parsedInput.companyName),
      email: blankToNull(parsedInput.email),
      phone: blankToNull(parsedInput.phone),
      website: blankToNull(parsedInput.website),
      photoUrl: blankToNull(parsedInput.photoUrl),
      location: blankToNull(parsedInput.location),
      linkedinUrl: blankToNull(parsedInput.linkedinUrl),
      xUrl: blankToNull(parsedInput.xUrl),
      instagramUrl: blankToNull(parsedInput.instagramUrl),
    };

    try {
      const card = await prisma.contactCard.upsert({
        where: { emailAccountId },
        update: fields,
        create: { emailAccountId, ...fields },
      });

      return { card, url: getContactCardUrl(card.slug) };
    } catch (error) {
      if (isDuplicateError(error, "slug")) {
        throw new SafeError("That link is already taken — try another");
      }
      throw error;
    }
  });

// Sends from the user's own mailbox rather than a transactional address:
// they just met this person, so the note should come from them and land in
// their Sent folder.
export const sendMyCardAction = actionClient
  .metadata({ name: "sendMyCard" })
  .inputSchema(sendMyCardBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { to, recipientName },
    }) => {
      const card = await prisma.contactCard.findUnique({
        where: { emailAccountId },
        select: { slug: true, displayName: true, isActive: true },
      });
      if (!card?.isActive) {
        throw new SafeError(
          "Set up your card first — open My Card in Contacts",
        );
      }

      const url = getContactCardUrl(card.slug);
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const greeting = recipientName?.trim()
        ? `Hi ${escapeHtml(recipientName.trim())},`
        : "Hi,";

      await emailProvider.sendEmailWithHtml({
        to,
        subject: `${card.displayName} — my contact details`,
        messageHtml: `<p>${greeting}</p>
<p>Great to meet you. Here are my details: <a href="${url}">${url}</a></p>
<p>${escapeHtml(card.displayName)}</p>`,
      });

      return { sent: true, url };
    },
  );

// Accepting turns the submission into a real contact; ignoring just files it
// away. Either way the row is resolved so it leaves the review list.
export const resolveContactCardExchangeAction = actionClient
  .metadata({ name: "resolveContactCardExchange" })
  .inputSchema(resolveContactCardExchangeBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { exchangeId, accept },
    }) => {
      // Scoped through the card so one account can't resolve another's
      const exchange = await prisma.contactCardExchange.findFirst({
        where: {
          id: exchangeId,
          status: ContactCardExchangeStatus.PENDING,
          contactCard: { emailAccountId },
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          companyTitle: true,
          note: true,
        },
      });
      if (!exchange) throw new SafeError("That submission is no longer there");

      if (accept) {
        const details = {
          name: exchange.name,
          ...(exchange.companyTitle ? { title: exchange.companyTitle } : {}),
          ...(exchange.phone
            ? { phones: [{ label: "Mobile", value: exchange.phone }] }
            : {}),
          ...(exchange.note ? { notes: exchange.note } : {}),
        };

        await prisma.contact.upsert({
          where: {
            emailAccountId_email: {
              emailAccountId,
              email: exchange.email,
            },
          },
          update: details,
          create: { emailAccountId, email: exchange.email, ...details },
        });
      }

      await prisma.contactCardExchange.update({
        where: { id: exchange.id },
        data: {
          status: accept
            ? ContactCardExchangeStatus.ACCEPTED
            : ContactCardExchangeStatus.IGNORED,
        },
      });

      return { resolved: true, accepted: accept };
    },
  );

function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
