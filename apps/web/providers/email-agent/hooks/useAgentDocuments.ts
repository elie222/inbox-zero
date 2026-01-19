"use client";

import useSWR from "swr";
import type {
  AgentDocument,
  CreateAgentDocumentRequest,
  UpdateAgentDocumentRequest,
} from "../types";

export function useAgentDocuments() {
  return useSWR<AgentDocument[]>("/api/user/agent/documents");
}

export function useAgentDocument(documentId: string | null) {
  return useSWR<AgentDocument>(
    documentId ? `/api/user/agent/documents/${documentId}` : null,
  );
}

export function useAgentDocumentsMutation() {
  const { data, mutate } = useAgentDocuments();

  const createDocument = async (
    doc: CreateAgentDocumentRequest,
  ): Promise<AgentDocument> => {
    const response = await fetch("/api/user/agent/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });

    if (!response.ok) {
      throw new Error("Failed to create document");
    }

    const created = await response.json();
    mutate([...(data || []), created], false);
    return created;
  };

  const updateDocument = async (
    documentId: string,
    updates: UpdateAgentDocumentRequest,
  ): Promise<AgentDocument> => {
    const response = await fetch(`/api/user/agent/documents/${documentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error("Failed to update document");
    }

    const updated = await response.json();
    mutate(
      data?.map((doc) => (doc.id === documentId ? updated : doc)),
      false,
    );
    return updated;
  };

  const deleteDocument = async (documentId: string): Promise<void> => {
    const response = await fetch(`/api/user/agent/documents/${documentId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete document");
    }

    mutate(
      data?.filter((doc) => doc.id !== documentId),
      false,
    );
  };

  return {
    documents: data,
    createDocument,
    updateDocument,
    deleteDocument,
    mutate,
  };
}
