"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import {
  ZapIcon,
  BookOpenIcon,
  SaveIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
} from "lucide-react";
import { RuleNode, ContextNode, type RuleMetadata } from "./nodes";
import { SlashCommands, createSlashCommandsPlugin } from "./slash-commands";
import { cn } from "@/utils";
import { toast } from "sonner";
import { generateRuleMetadataAction } from "@/utils/actions/rule";

interface RulesEditorProps {
  initialContent?: any;
  documentId?: string;
  documentTitle?: string;
  emailAccountId: string;
  onSave?: (content: any, title: string) => Promise<void>;
}

export function RulesEditor({
  initialContent,
  documentId,
  documentTitle = "Untitled Rules Document",
  emailAccountId,
  onSave,
}: RulesEditorProps) {
  const [title, setTitle] = useState(documentTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAllExpanded, setShowAllExpanded] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        document: {
          content: "block+",
        },
        paragraph: {
          HTMLAttributes: {
            class: "mb-4",
          },
        },
      }),
      RuleNode,
      ContextNode,
      SlashCommands.configure(createSlashCommandsPlugin()),
    ],
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Start typing or use /rule or /context to add nodes...",
            },
          ],
        },
      ],
    },
    autofocus: true,
  });

  const handleSave = useCallback(async () => {
    if (!editor || !onSave) return;

    setIsSaving(true);
    const json = editor.getJSON();

    try {
      // Process all rule nodes that don't have metadata
      const processPromises: Promise<void>[] = [];

      const processNode = async (node: any, path: number[]) => {
        if (node.type === "rule" && !node.attrs.metadata) {
          const textContent =
            editor.view.state.doc.nodeAt(
              path.reduce((pos, idx) => {
                let offset = 0;
                for (let i = 0; i < idx; i++) {
                  offset += editor.view.state.doc.nodeAt(pos)?.nodeSize || 0;
                }
                return pos + offset;
              }, 0),
            )?.textContent || "";

          if (textContent.trim()) {
            const metadata = await generateRuleMetadataAction(emailAccountId, {
              ruleContent: textContent,
            });

            if (metadata?.data) {
              // Update the node with the generated metadata
              const { selection } = editor.state;
              editor
                .chain()
                .focus()
                .command(({ tr }) => {
                  const pos = path.reduce((p, idx) => p + idx, 0);
                  tr.setNodeAttribute(pos, "metadata", metadata.data);
                  return true;
                })
                .run();
            }
          }
        }

        // Recursively process child nodes
        if (node.content) {
          node.content.forEach((child: any, index: number) => {
            processNode(child, [...path, index]);
          });
        }
      };

      // Start processing from the document root
      json.content?.forEach((node: any, index: number) => {
        processPromises.push(processNode(node, [index]));
      });

      await Promise.all(processPromises);

      // Get the updated content after processing
      const updatedJson = editor.getJSON();
      await onSave(updatedJson, title);

      toast.success("Document saved successfully!");
    } catch (error) {
      console.error("Error saving document:", error);
      toast.error("Failed to save document");
    } finally {
      setIsSaving(false);
    }
  }, [editor, onSave, title, emailAccountId]);

  const insertRule = useCallback(() => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "rule",
        content: [{ type: "text", text: "" }],
      })
      .run();
  }, [editor]);

  const insertContext = useCallback(() => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "context",
        content: [{ type: "text", text: "" }],
      })
      .run();
  }, [editor]);

  const toggleAllExpanded = useCallback(() => {
    setShowAllExpanded(!showAllExpanded);
    // This would need to be implemented with a global state or context
    // to communicate with all RuleNodeView components
  }, [showAllExpanded]);

  if (!editor) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Header */}
      <div className="mb-6 border-b pb-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex-1">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-2xl font-bold"
                  placeholder="Document title..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setIsEditingTitle(false);
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingTitle(false)}
                >
                  Done
                </Button>
              </div>
            ) : (
              <h1
                className="group flex cursor-pointer items-center text-2xl font-bold"
                onClick={() => setIsEditingTitle(true)}
              >
                {title}
                <PencilIcon className="ml-2 h-5 w-5 opacity-0 transition-opacity group-hover:opacity-50" />
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllExpanded}
              className="gap-2"
            >
              {showAllExpanded ? (
                <EyeOffIcon className="h-4 w-4" />
              ) : (
                <EyeIcon className="h-4 w-4" />
              )}
              {showAllExpanded ? "Collapse All" : "Expand All"}
            </Button>

            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              <SaveIcon className="h-4 w-4" />
              {isSaving ? "Processing..." : "Save & Process"}
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={insertRule}
            className="gap-2"
          >
            <ZapIcon className="h-4 w-4 text-green-600" />
            Add Rule
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={insertContext}
            className="gap-2"
          >
            <BookOpenIcon className="h-4 w-4 text-blue-600" />
            Add Context
          </Button>

          <div className="ml-4 text-sm text-gray-500">
            Tip: Type "/" to see available commands
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="prose prose-lg max-w-none">
        <EditorContent
          editor={editor}
          className={cn(
            "min-h-[500px] rounded-lg border p-6",
            "focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2",
          )}
        />
      </div>

      {/* Status indicators */}
      {editor && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <div>
            {editor.storage.characterCount?.characters() || 0} characters
          </div>
          <div>
            {documentId ? `Document ID: ${documentId}` : "New document"}
          </div>
        </div>
      )}
    </div>
  );
}
