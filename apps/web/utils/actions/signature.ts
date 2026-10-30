"use server";

import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import {
  createSignatureBody,
  deleteSignatureBody,
  updateSignatureBody,
} from "@/utils/actions/signature.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { findSentSignatures } from "@/utils/email/sent-signatures";
import { SafeError } from "@/utils/error";
import { isDuplicateError } from "@/utils/prisma-helpers";

export const createSignatureAction = actionClient
  .metadata({ name: "createSignature" })
  .inputSchema(createSignatureBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { name, html } }) => {
    try {
      await prisma.emailSignature.create({
        data: { emailAccountId, name, html },
      });
    } catch (error) {
      if (isDuplicateError(error, "name"))
        throw new SafeError(`You already have a signature named ${name}.`);
      throw error;
    }
  });

export const updateSignatureAction = actionClient
  .metadata({ name: "updateSignature" })
  .inputSchema(updateSignatureBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { id, name, html } }) => {
      try {
        const { count } = await prisma.emailSignature.updateMany({
          where: { emailAccountId, id },
          data: { name, html },
        });
        if (count === 0) throw new SafeError("Signature not found");
      } catch (error) {
        if (isDuplicateError(error, "name"))
          throw new SafeError(`You already have a signature named ${name}.`);
        throw error;
      }
    },
  );

export const deleteSignatureAction = actionClient
  .metadata({ name: "deleteSignature" })
  .inputSchema(deleteSignatureBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    const { count } = await prisma.emailSignature.deleteMany({
      where: { emailAccountId, id },
    });
    if (count === 0) throw new SafeError("Signature not found");
  });

export const findSentSignaturesAction = actionClient
  .metadata({ name: "findSentSignatures" })
  .action(async ({ ctx: { emailAccountId, provider, logger } }) => {
    const [emailProvider, emailAccount] = await Promise.all([
      createEmailProvider({ emailAccountId, provider, logger }),
      prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          signature: true,
          emailSignatures: { select: { html: true } },
        },
      }),
    ]);

    const signatures = await findSentSignatures({
      emailProvider,
      knownSignatures: [
        emailAccount?.signature ?? "",
        ...(emailAccount?.emailSignatures.map(({ html }) => html) ?? []),
      ],
    });

    return { signatures };
  });
