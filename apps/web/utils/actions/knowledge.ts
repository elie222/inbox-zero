"use server";

import prisma from "@/utils/prisma";
import {
  createKnowledgeBody,
  updateKnowledgeBody,
  deleteKnowledgeBody,
} from "@/utils/actions/knowledge.validation";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import {
  KNOWLEDGE_BASIC_MAX_ITEMS,
  KNOWLEDGE_BASIC_MAX_CHARS,
} from "@/utils/config";
import { PremiumTier } from "@prisma/client";
import { checkHasAccess } from "@/utils/premium/server";

export const createKnowledgeAction = actionClient
  .metadata({ name: "createKnowledge" })
  .schema(createKnowledgeBody)
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
          minimumTier: PremiumTier.BUSINESS_PLUS_MONTHLY,
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
  .schema(updateKnowledgeBody)
  .action(
    async ({
      ctx: { emailAccountId, userId },
      parsedInput: { id, title, content },
    }) => {
      if (content.length > KNOWLEDGE_BASIC_MAX_CHARS) {
        const hasAccess = await checkHasAccess({
          userId,
          minimumTier: PremiumTier.BUSINESS_PLUS_MONTHLY,
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
  .schema(deleteKnowledgeBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await prisma.knowledge.delete({
      where: { id, emailAccountId },
    });
  });
