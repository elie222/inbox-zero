"use server";

import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import {
  createSnippetBody,
  deleteSnippetBody,
  updateSnippetBody,
} from "@/utils/actions/snippet.validation";
import { SafeError } from "@/utils/error";
import { isDuplicateError } from "@/utils/prisma-helpers";

export const createSnippetAction = actionClient
  .metadata({ name: "createSnippet" })
  .inputSchema(createSnippetBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { content, shortcut } }) => {
      try {
        const snippet = await prisma.snippet.create({
          data: {
            content,
            emailAccountId,
            shortcut,
          },
        });
        return { snippet };
      } catch (error) {
        if (isDuplicateError(error, "shortcut")) {
          throw new SafeError(`You already have a /${shortcut} snippet.`);
        }
        throw error;
      }
    },
  );

export const updateSnippetAction = actionClient
  .metadata({ name: "updateSnippet" })
  .inputSchema(updateSnippetBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { content, id, shortcut },
    }) => {
      try {
        const { count } = await prisma.snippet.updateMany({
          where: { emailAccountId, id },
          data: { content, shortcut },
        });
        if (count === 0) throw new SafeError("Snippet not found");
      } catch (error) {
        if (isDuplicateError(error, "shortcut")) {
          throw new SafeError(`You already have a /${shortcut} snippet.`);
        }
        throw error;
      }
    },
  );

export const deleteSnippetAction = actionClient
  .metadata({ name: "deleteSnippet" })
  .inputSchema(deleteSnippetBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    const { count } = await prisma.snippet.deleteMany({
      where: { emailAccountId, id },
    });
    if (count === 0) throw new SafeError("Snippet not found");
  });
