"use server";

import prisma from "@/utils/prisma";
import {
  createKnowledgeBody,
  updateKnowledgeBody,
  deleteKnowledgeBody,
  updateDraftDocsUrlsBody,
} from "@/utils/actions/knowledge.validation";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import {
  KNOWLEDGE_BASIC_MAX_ITEMS,
  KNOWLEDGE_BASIC_MAX_CHARS,
  DRAFT_DOCS_BASIC_MAX_URLS,
} from "@/utils/config";
import { PremiumTier } from "@/generated/prisma/enums";
import { checkHasAccess } from "@/utils/premium/server";
import { normalizeDocsSourceUrl } from "@/utils/docs-sources/url";

export const createKnowledgeAction = actionClient
  .metadata({ name: "createKnowledge" })
  .inputSchema(createKnowledgeBody)
  .action(
    async ({
      ctx: { emailAccountId, userId },
      parsedInput: { title, content },
    }) => {
      const knowledgeCount = await prisma.knowledge.count({
        where: { emailAccountId },
      });

      // premium check
      if (
        knowledgeCount >= KNOWLEDGE_BASIC_MAX_ITEMS ||
        content.length > KNOWLEDGE_BASIC_MAX_CHARS
      ) {
        const hasAccess = await checkHasAccess({
          userId,
          minimumTier: PremiumTier.PLUS_MONTHLY,
        });

        if (!hasAccess) {
          throw new SafeError(
            `You can save up to ${KNOWLEDGE_BASIC_MAX_CHARS} characters and ${KNOWLEDGE_BASIC_MAX_ITEMS} item to your knowledge base. Upgrade to a higher tier to save unlimited content.`,
          );
        }
      }

      await prisma.knowledge.create({
        data: {
          title,
          content,
          emailAccountId,
        },
      });
    },
  );

export const updateKnowledgeAction = actionClient
  .metadata({ name: "updateKnowledge" })
  .inputSchema(updateKnowledgeBody)
  .action(
    async ({
      ctx: { emailAccountId, userId },
      parsedInput: { id, title, content },
    }) => {
      if (content.length > KNOWLEDGE_BASIC_MAX_CHARS) {
        const hasAccess = await checkHasAccess({
          userId,
          minimumTier: PremiumTier.PLUS_MONTHLY,
        });

        if (!hasAccess) {
          throw new SafeError(
            `You can save up to ${KNOWLEDGE_BASIC_MAX_CHARS} characters to your knowledge base. Upgrade to a higher tier to save unlimited content.`,
          );
        }
      }

      await prisma.knowledge.update({
        where: { id, emailAccountId },
        data: { title, content },
      });
    },
  );

export const deleteKnowledgeAction = actionClient
  .metadata({ name: "deleteKnowledge" })
  .inputSchema(deleteKnowledgeBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await prisma.knowledge.delete({
      where: { id, emailAccountId },
    });
  });

export const updateDraftDocsUrlsAction = actionClient
  .metadata({ name: "updateDraftDocsUrls" })
  .inputSchema(updateDraftDocsUrlsBody)
  .action(async ({ ctx: { emailAccountId, userId }, parsedInput }) => {
    const urls: string[] = [];
    for (const input of parsedInput.urls) {
      const url = normalizeDocsSourceUrl(input);
      if (!url) {
        throw new SafeError(
          `"${input}" is not a public https URL, like https://docs.example.com`,
        );
      }
      if (!urls.includes(url)) urls.push(url);
    }

    const current = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { draftDocsUrls: true },
    });
    // Removals stay open after a downgrade; only adding a site needs the tier
    const addsSite = urls.some((url) => !current?.draftDocsUrls.includes(url));

    if (addsSite && urls.length > DRAFT_DOCS_BASIC_MAX_URLS) {
      const hasAccess = await checkHasAccess({
        userId,
        minimumTier: PremiumTier.PLUS_MONTHLY,
      });

      if (!hasAccess) {
        throw new SafeError(
          `You can add ${DRAFT_DOCS_BASIC_MAX_URLS} documentation site. Upgrade to a higher tier to add more.`,
        );
      }
    }

    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { draftDocsUrls: urls },
    });
  });
