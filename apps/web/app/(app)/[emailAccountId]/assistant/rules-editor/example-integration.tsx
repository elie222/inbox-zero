"use client";

import { RulesEditor, type RuleMetadata } from "@/components/rules-editor";
import { ActionType } from "@prisma/client";
import { toastError } from "@/components/Toast";

// Example of how to integrate with your backend API
export function RulesEditorIntegration({ emailAccountId }: { emailAccountId: string }) {
  // Function to generate metadata using your AI service
  async function generateRuleMetadata(ruleContent: string): Promise<RuleMetadata> {
    try {
      // In production, call your AI service endpoint
      const response = await fetch(`/api/ai/generate-rule-metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ruleContent,
          emailAccountId 
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate metadata");
      }

      const data = await response.json();
      
      // Transform the response to match RuleMetadata format
      return {
        ruleName: data.ruleName,
        actions: data.actions.map((action: any) => ({
          type: action.type,
          label: action.label,
          content: action.content,
        })),
      };
    } catch (error) {
      console.error("Error generating metadata:", error);
      // Fallback to a simple rule
      return {
        ruleName: `Rule: ${ruleContent.slice(0, 50)}...`,
        actions: [{ type: ActionType.LABEL, label: "Processed" }],
      };
    }
  }

  // Function to save the rules document
  async function handleSave(title: string, content: any) {
    try {
      const response = await fetch(`/api/rules/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          emailAccountId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save document");
      }

      const { documentId } = await response.json();
      
      // Optionally redirect to the saved document
      window.location.href = `/assistant/rules-editor/${documentId}`;
    } catch (error) {
      toastError({
        description: error instanceof Error ? error.message : "Failed to save document",
      });
    }
  }

  // Load existing document (if editing)
  async function loadDocument(documentId: string) {
    const response = await fetch(`/api/rules/documents/${documentId}`);
    if (!response.ok) {
      throw new Error("Failed to load document");
    }
    return response.json();
  }

  return (
    <RulesEditor
      initialTitle="Email Automation Rules"
      initialContent={null} // Or load from API
      onSave={handleSave}
      generateRuleMetadata={generateRuleMetadata}
    />
  );
}

// Example API response format for rule metadata generation
export interface GenerateMetadataResponse {
  ruleName: string;
  actions: Array<{
    type: ActionType;
    label?: string;
    content?: string;
  }>;
}

// Example document format for saving
export interface RulesDocument {
  id: string;
  title: string;
  content: any; // TipTap JSON content
  createdAt: Date;
  updatedAt: Date;
  emailAccountId: string;
}