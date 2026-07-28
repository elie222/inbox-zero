"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  sendMyCardBody,
  upsertContactCardBody,
} from "@/utils/actions/contact-card.validation";
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
