"use server";

import { z } from "zod";
import { actionClient } from "@/utils/actions/safe-action";
import {
  updateAgentConfigBody,
  createAgentDocumentBody,
  updateAgentDocumentBody,
} from "./validation";
import { getOrCreateAgentConfig, updateAgentConfig } from "../api/config";
import {
  createAgentDocument,
  updateAgentDocument,
  deleteAgentDocument,
  getOrCreateMainDocument,
} from "../api/documents";

export const toggleAgentEnabledAction = actionClient
  .metadata({ name: "toggleAgentEnabled" })
  .inputSchema(updateAgentConfigBody.pick({ enabled: true }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { enabled } }) => {
    const config = await updateAgentConfig(emailAccountId, { enabled });
    return { config };
  });

export const updateAgentConfigAction = actionClient
  .metadata({ name: "updateAgentConfig" })
  .inputSchema(updateAgentConfigBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const config = await updateAgentConfig(emailAccountId, parsedInput);
    return { config };
  });

export const createDocumentAction = actionClient
  .metadata({ name: "createAgentDocument" })
  .inputSchema(createAgentDocumentBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const document = await createAgentDocument(emailAccountId, parsedInput);
    return { document };
  });

export const updateDocumentAction = actionClient
  .metadata({ name: "updateAgentDocument" })
  .inputSchema(updateAgentDocumentBody.extend({ documentId: z.string() }))
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { documentId, ...updates },
    }) => {
      const document = await updateAgentDocument(
        documentId,
        emailAccountId,
        updates,
      );
      if (!document) {
        throw new Error("Document not found or unauthorized");
      }
      return { document };
    },
  );

export const deleteDocumentAction = actionClient
  .metadata({ name: "deleteAgentDocument" })
  .inputSchema(z.object({ documentId: z.string() }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { documentId } }) => {
    const success = await deleteAgentDocument(documentId, emailAccountId);
    if (!success) {
      throw new Error("Document not found or unauthorized");
    }
    return { success };
  });

export const getOrCreateMainDocumentAction = actionClient
  .metadata({ name: "getOrCreateMainDocument" })
  .action(async ({ ctx: { emailAccountId } }) => {
    const document = await getOrCreateMainDocument(emailAccountId);
    return { document };
  });

export const initializeAgentConfigAction = actionClient
  .metadata({ name: "initializeAgentConfig" })
  .action(async ({ ctx: { emailAccountId } }) => {
    const config = await getOrCreateAgentConfig(emailAccountId);
    return { config };
  });
