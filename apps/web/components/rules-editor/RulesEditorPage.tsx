"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RulesEditor } from "./RulesEditor";
import type { RuleMetadata } from "./nodes/RuleNode";
import { aiCreateRule } from "@/utils/ai/rule/create-rule";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { actionClient } from "@/utils/actions/safe-action";
import { z } from "zod";
import { ActionType } from "@prisma/client";
import prisma from "@/utils/prisma";

// Action to generate rule metadata from text
const generateRuleMetadataAction = actionClient
  .metadata({ name: "generateRuleMetadata" })
  .schema(z.object({ content: z.string() }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { content } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        id: true,
        email: true,
        userId: true,
        about: true,
        user: {
          select: {
            aiProvider: true,
            aiModel: true,
            aiApiKey: true,
          },
        },
      },
    });

    if (!emailAccount) {
      throw new Error("Email account not found");
    }

    const result = await aiCreateRule(content, emailAccount);

    // Convert to RuleMetadata format
    const metadata: RuleMetadata = {
      name: result.name,
      actions: result.actions.map((action) => ({
        type: action.type,
        content: action.fields?.content || undefined,
        label: action.fields?.label || undefined,
        to: action.fields?.to || undefined,
        cc: action.fields?.cc || undefined,
        bcc: action.fields?.bcc || undefined,
        url: action.fields?.webhookUrl || undefined,
      })),
    };

    return metadata;
  });

// Action to save the rules document
const saveRulesDocumentAction = actionClient
  .metadata({ name: "saveRulesDocument" })
  .schema(
    z.object({
      title: z.string(),
      content: z.any(), // TipTap JSON content
    }),
  )
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { title, content } }) => {
      // Here you would save the document to your database
      // For example, you might create a new table for rules documents
      // or save it as JSON in the EmailAccount model

      // This is a placeholder - implement based on your data model
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          // rulesDocument: content, // Add this field to your schema
          // rulesDocumentTitle: title,
        },
      });

      return { success: true };
    },
  );

export function RulesEditorPage() {
  const router = useRouter();
  const { emailAccountId } = useAccount();
  const [isGenerating, setIsGenerating] = useState(false);

  // Generate rule metadata using AI
  async function generateRuleMetadata(content: string): Promise<RuleMetadata> {
    setIsGenerating(true);
    try {
      const result = await generateRuleMetadataAction(emailAccountId, {
        content,
      });

      if (result?.serverError) {
        console.error("Error generating metadata:", result.serverError);
        throw new Error(result.serverError);
      }

      if (!result?.data) {
        throw new Error("No data returned from AI");
      }

      return result.data;
    } catch (error) {
      console.error("Error generating rule metadata:", error);
      toastError({
        description: "Failed to generate rule metadata. Please try again.",
      });
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }

  // Save the document
  async function handleSave(title: string, content: any): Promise<void> {
    try {
      const result = await saveRulesDocumentAction(emailAccountId, {
        title,
        content,
      });

      if (result?.serverError) {
        console.error("Error saving document:", result.serverError);
        throw new Error(result.serverError);
      }

      toastSuccess({ description: "Rules document saved successfully!" });

      // Navigate back to the rules page
      router.push(`/${emailAccountId}/assistant?tab=rules`);
    } catch (error) {
      console.error("Error saving document:", error);
      toastError({
        description: "Failed to save document. Please try again.",
      });
      throw error;
    }
  }

  return (
    <div className="h-screen bg-gray-50">
      <RulesEditor
        initialTitle="My Email Rules"
        onSave={handleSave}
        generateRuleMetadata={generateRuleMetadata}
      />

      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
              <span className="text-lg">
                Generating rule metadata with AI...
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
