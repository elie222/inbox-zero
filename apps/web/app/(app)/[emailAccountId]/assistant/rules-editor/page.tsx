"use client";

import { RulesEditor } from "./RulesEditor";
import { createRulesDocumentAction } from "@/utils/actions/rule";
import { toast } from "sonner";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useState } from "react";

export default function RulesEditorPage({
  searchParams,
}: {
  searchParams: { documentId?: string };
}) {
  const { emailAccountId } = useAccount();
  const { documentId } = searchParams;
  const [currentDocumentId, setCurrentDocumentId] = useState(documentId);

  async function handleSave(content: any, title: string) {
    try {
      const result = await createRulesDocumentAction(emailAccountId, {
        title,
        content,
        documentId: currentDocumentId,
      });

      if (result?.data?.documentId && !currentDocumentId) {
        setCurrentDocumentId(result.data.documentId);
        // Update URL without navigation
        window.history.pushState(
          {},
          "",
          `?documentId=${result.data.documentId}`,
        );
      }

      toast.success("Document saved!");
    } catch (error) {
      toast.error("Failed to save document");
    }
  }

  return (
    <div className="container mx-auto py-8">
      <RulesEditor
        emailAccountId={emailAccountId}
        documentId={currentDocumentId}
        documentTitle="My Email Rules"
        onSave={handleSave}
      />
    </div>
  );
}
