"use client";

import { useState, useRef, useCallback } from "react";
import { RulesEditor, type RulesEditorHandle, type RuleMetadata } from "@/components/editor/RulesEditor";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toast } from "sonner";

export default function RulesEditorPage() {
  const { emailAccountId } = useAccount();
  const editorRef = useRef<RulesEditorHandle>(null);
  const [documentTitle, setDocumentTitle] = useState("My Email Rules");
  const [content, setContent] = useState<any>(null);

  const generateRuleMetadata = useCallback(async (ruleContent: string): Promise<RuleMetadata> => {
    try {
      const response = await fetch("/api/ai/generate-rule-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailAccountId,
          ruleContent,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate rule metadata");
      }

      const data = await response.json();
      return data.metadata;
    } catch (error) {
      console.error("Error generating rule metadata:", error);
      throw error;
    }
  }, [emailAccountId]);

  const handleSave = useCallback(async (content: any) => {
    try {
      // Save the rules document
      const response = await fetch("/api/user/rules-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailAccountId,
          title: documentTitle,
          content,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save rules document");
      }

      toast.success("Rules saved successfully!");
    } catch (error) {
      console.error("Error saving rules:", error);
      toast.error("Failed to save rules");
    }
  }, [emailAccountId, documentTitle]);

  return (
    <div className="content-container mx-auto max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Rules Editor</h1>
        <p className="mt-2 text-gray-600">
          Create and manage your email rules using a document-style editor. Use slash commands (/) to add rules and context.
        </p>
      </div>

      <RulesEditor
        ref={editorRef}
        initialContent={content}
        onChange={setContent}
        onSave={handleSave}
        generateRuleMetadata={generateRuleMetadata}
        documentTitle={documentTitle}
        onTitleChange={setDocumentTitle}
      />
    </div>
  );
}