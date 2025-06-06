"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState, useCallback } from "react";
import { Zap, BookOpen, Save, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils";
import { RuleNode, RuleCommands, type RuleMetadata } from "./nodes/RuleNode";
import { ContextNode, ContextCommands } from "./nodes/ContextNode";
import { SlashCommands } from "./extensions/SlashCommands";
import { toastError, toastSuccess } from "@/components/Toast";

interface RulesEditorProps {
  initialTitle?: string;
  initialContent?: any;
  onSave?: (title: string, content: any) => Promise<void>;
  generateRuleMetadata?: (content: string) => Promise<RuleMetadata>;
}

export function RulesEditor({
  initialTitle = "Untitled Rules Document",
  initialContent = null,
  onSave,
  generateRuleMetadata,
}: RulesEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [showAllExpanded, setShowAllExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [processingNodes, setProcessingNodes] = useState<Set<string>>(
    new Set(),
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      RuleNode.extend({
        addCommands() {
          return {
            ...RuleCommands,
          };
        },
      }),
      ContextNode.extend({
        addCommands() {
          return {
            ...ContextCommands,
          };
        },
      }),
      SlashCommands,
    ],
    content:
      initialContent ||
      "<p>Start typing or use /rule or /context to add nodes...</p>",
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none min-h-[400px]",
          "prose-headings:font-semibold prose-p:text-gray-700",
        ),
      },
    },
  });

  const handleSave = useCallback(async () => {
    if (!editor || !onSave || !generateRuleMetadata) return;

    setIsSaving(true);
    const json = editor.getJSON();
    const newProcessingNodes = new Set<string>();

    try {
      // Process all rule nodes without metadata
      if (json.content) {
        const processPromises: Promise<void>[] = [];

        const processNode = (node: any) => {
          if (node.type === "rule" && !node.attrs?.metadata && node.attrs?.id) {
            newProcessingNodes.add(node.attrs.id);
            setProcessingNodes(new Set(newProcessingNodes));

            const promise = (async () => {
              try {
                // Get text content from the node
                const textContent = extractTextFromNode(node);
                if (textContent) {
                  const metadata = await generateRuleMetadata(textContent);
                  // Update the node with metadata
                  editor.commands.updateRuleMetadata(node.attrs.id, metadata);
                }
              } catch (error) {
                console.error("Error generating metadata for rule:", error);
              } finally {
                newProcessingNodes.delete(node.attrs.id);
                setProcessingNodes(new Set(newProcessingNodes));
              }
            })();

            processPromises.push(promise);
          }

          // Recursively process child nodes
          if (node.content) {
            node.content.forEach(processNode);
          }
        };

        json.content.forEach(processNode);
        await Promise.all(processPromises);
      }

      // Save the document
      await onSave(title, editor.getJSON());
      toastSuccess({ description: "Rules document saved successfully!" });
    } catch (error) {
      console.error("Error saving document:", error);
      toastError({ description: "Failed to save document" });
    } finally {
      setIsSaving(false);
      setProcessingNodes(new Set());
    }
  }, [editor, title, onSave, generateRuleMetadata]);

  const extractTextFromNode = (node: any): string => {
    if (node.type === "text") {
      return node.text || "";
    }
    if (node.content) {
      return node.content.map(extractTextFromNode).join("");
    }
    return "";
  };

  const insertRule = () => {
    editor?.chain().focus().insertRule().run();
  };

  const insertContext = () => {
    editor?.chain().focus().insertContext().run();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-0 bg-transparent px-0 text-xl font-semibold focus:ring-0"
            placeholder="Document title..."
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllExpanded(!showAllExpanded)}
            >
              {showAllExpanded ? (
                <>
                  <EyeOff className="mr-2 h-4 w-4" />
                  Collapse All
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  Expand All
                </>
              )}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !editor}
              size="sm"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Processing..." : "Save & Process"}
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="border-b bg-gray-50 px-6 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={insertRule}
            disabled={!editor}
            className="text-green-700 hover:bg-green-100"
          >
            <Zap className="mr-2 h-4 w-4" />
            Rule
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={insertContext}
            disabled={!editor}
            className="text-blue-700 hover:bg-blue-100"
          >
            <BookOpen className="mr-2 h-4 w-4" />
            Context
          </Button>
          <div className="ml-4 text-sm text-gray-500">
            Tip: Use{" "}
            <kbd className="rounded bg-gray-100 px-1 py-0.5 text-xs">/</kbd> for
            quick commands
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto bg-white">
        <div className="mx-auto max-w-4xl p-6">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Status bar */}
      {processingNodes.size > 0 && (
        <div className="border-t bg-yellow-50 px-6 py-2">
          <div className="text-sm text-yellow-800">
            Processing {processingNodes.size} rule
            {processingNodes.size > 1 ? "s" : ""}...
          </div>
        </div>
      )}
    </div>
  );
}
