"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAction } from "next-safe-action/hooks";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  useAgentDocuments,
  useAgentDocumentsMutation,
} from "../hooks/useAgentDocuments";
import {
  updateDocumentAction,
  createDocumentAction,
  deleteDocumentAction,
} from "../actions/agent-actions";
import type { AgentDocument } from "../types";

interface DocumentEditorProps {
  emailAccountId: string;
}

export function DocumentEditor({ emailAccountId }: DocumentEditorProps) {
  const { data: documents, isLoading, error } = useAgentDocuments();
  const { mutate } = useAgentDocumentsMutation();
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Set active document to first one on load
  useEffect(() => {
    if (documents && documents.length > 0 && !activeDocId) {
      setActiveDocId(documents[0].id);
    }
  }, [documents, activeDocId]);

  const activeDocument = documents?.find((d) => d.id === activeDocId);

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          {documents && documents.length > 0 ? (
            <Tabs
              value={activeDocId || undefined}
              onValueChange={setActiveDocId}
              className="flex-1"
            >
              <TabsList>
                {documents.map((doc) => (
                  <TabsTrigger key={doc.id} value={doc.id}>
                    {doc.title}
                    {doc.type === "MAIN" && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (main)
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : (
            <div className="text-muted-foreground text-sm">
              No documents yet
            </div>
          )}

          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Skill
              </Button>
            </DialogTrigger>
            <CreateDocumentDialog
              emailAccountId={emailAccountId}
              onCreated={(doc) => {
                mutate();
                setActiveDocId(doc.id);
                setShowCreateDialog(false);
              }}
            />
          </Dialog>
        </div>

        {activeDocument ? (
          <DocumentEditorContent
            key={activeDocument.id}
            document={activeDocument}
            emailAccountId={emailAccountId}
            onDelete={() => {
              mutate();
              setActiveDocId(documents?.[0]?.id || null);
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Select or create a document to get started</p>
          </div>
        )}
      </div>
    </LoadingContent>
  );
}

interface DocumentEditorContentProps {
  document: AgentDocument;
  emailAccountId: string;
  onDelete: () => void;
}

function DocumentEditorContent({
  document,
  emailAccountId,
  onDelete,
}: DocumentEditorContentProps) {
  const editorRef = useRef<TiptapHandle>(null);
  const [content, setContent] = useState(document.content);
  const [hasChanges, setHasChanges] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { execute: executeSave, isExecuting: isSaving } = useAction(
    updateDocumentAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Document saved" });
        setHasChanges(false);
      },
      onError: (error) => {
        toastError({
          description: error.error?.serverError || "Failed to save document",
        });
      },
    },
  );

  const { execute: executeDelete, isExecuting: isDeleting } = useAction(
    deleteDocumentAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Document deleted" });
        onDelete();
      },
      onError: (error) => {
        toastError({
          description: error.error?.serverError || "Failed to delete document",
        });
      },
    },
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      setHasChanges(newContent !== document.content);
    },
    [document.content],
  );

  const handleSave = useCallback(() => {
    executeSave({ documentId: document.id, content });
  }, [executeSave, document.id, content]);

  const handleDelete = useCallback(() => {
    executeDelete({ documentId: document.id });
    setShowDeleteDialog(false);
  }, [executeDelete, document.id]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-auto">
        <Tiptap
          initialContent={document.content}
          onChange={handleContentChange}
          output="markdown"
          className="prose prose-sm dark:prose-invert max-w-none min-h-[400px]"
          autofocus={false}
          preservePastedLineBreaks
          placeholder="Write your instructions here..."
          ref={editorRef}
        />
      </div>

      <div className="flex items-center justify-between border-t pt-4 mt-4">
        <div className="text-sm text-muted-foreground">
          {hasChanges ? (
            <span className="text-amber-600 dark:text-amber-400">
              Unsaved changes
            </span>
          ) : (
            <span>
              Last saved: {new Date(document.updatedAt).toLocaleString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {document.type !== "MAIN" && (
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Trash2Icon className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Document</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete "{document.title}"? This
                    action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    loading={isDeleting}
                  >
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Button
            onClick={handleSave}
            loading={isSaving}
            disabled={!hasChanges}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CreateDocumentDialogProps {
  emailAccountId: string;
  onCreated: (doc: AgentDocument) => void;
}

function CreateDocumentDialog({
  emailAccountId,
  onCreated,
}: CreateDocumentDialogProps) {
  const [title, setTitle] = useState("");

  const { execute, isExecuting } = useAction(
    createDocumentAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        if (result.data?.document) {
          toastSuccess({ description: "Document created" });
          onCreated(result.data.document);
        }
      },
      onError: (error) => {
        toastError({
          description: error.error?.serverError || "Failed to create document",
        });
      },
    },
  );

  const handleCreate = useCallback(() => {
    if (!title.trim()) return;
    execute({
      title: title.trim(),
      content: `# ${title.trim()}\n\nWrite your skill instructions here.\n`,
      type: "SKILL",
      enabled: true,
    });
  }, [execute, title]);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create New Skill</DialogTitle>
        <DialogDescription>
          Skills are specialized instructions that help the agent with specific
          tasks like drafting emails, researching topics, or handling specific
          types of messages.
        </DialogDescription>
      </DialogHeader>

      <div className="py-4">
        <Input
          type="text"
          name="title"
          label="Skill Name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Drafting Style, Research, Customer Support"
        />
      </div>

      <DialogFooter>
        <Button
          onClick={handleCreate}
          loading={isExecuting}
          disabled={!title.trim()}
        >
          Create
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
