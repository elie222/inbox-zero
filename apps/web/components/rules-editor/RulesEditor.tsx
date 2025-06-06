"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useState, useEffect } from "react";
import { ZapIcon, BookOpenIcon, SaveIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { cn } from "@/utils";
import { RuleNode } from "./nodes/RuleNode";
import { ContextNode } from "./nodes/ContextNode";
import type { RuleMetadata } from "./nodes/RuleNode";
import { toastError, toastSuccess, toastInfo } from "@/components/Toast";
import { Skeleton } from "@/components/ui/skeleton";

interface RulesEditorProps {
  initialTitle?: string;
  initialContent?: any;
  onSave?: (title: string, content: any) => Promise<void>;
  generateRuleMetadata?: (ruleContent: string) => Promise<RuleMetadata>;
}

// Global state for expanded nodes
let globalExpandedState = false;
const expandedNodes = new Set<string>();

export function RulesEditor({
  initialTitle = "Untitled Rules",
  initialContent = null,
  onSave,
  generateRuleMetadata,
}: RulesEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const [processingNodes, setProcessingNodes] = useState<Set<string>>(new Set());
  const [showAllExpanded, setShowAllExpanded] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable default heading as we use custom nodes
        heading: false,
        // Keep other defaults
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      RuleNode,
      ContextNode,
    ],
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Start writing your rules document. Use /rule to create a rule or /context to add context.",
            },
          ],
        },
      ],
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none min-h-[500px]",
        ),
      },
    },
  });

  // Add command to toggle expand state
  useEffect(() => {
    if (editor) {
      // Force re-render of all rule nodes when expand state changes
      editor.chain().focus().run();
    }
  }, [showAllExpanded, editor]);

  const handleSave = useCallback(async () => {
    if (!editor || !onSave) return;

    setIsSaving(true);
    const content = editor.getJSON();
    
    try {
      // Process all rule nodes that don't have metadata
      const nodes = content.content || [];
      const nodesToProcess: Array<{ node: any; index: number }> = [];

      nodes.forEach((node, index) => {
        if (node.type === "rule" && !node.attrs?.metadata) {
          nodesToProcess.push({ node, index });
        }
      });

      if (nodesToProcess.length > 0 && generateRuleMetadata) {
        toastInfo({
          description: `Processing ${nodesToProcess.length} new rule${nodesToProcess.length > 1 ? "s" : ""}...`,
        });

        // Update processing state
        setProcessingNodes(new Set(nodesToProcess.map(({ node }) => node.attrs.id)));

        // Process all rules in parallel
        const metadataPromises = nodesToProcess.map(async ({ node, index }) => {
          const ruleText = node.content?.[0]?.text || "";
          if (!ruleText.trim()) return null;

          try {
            const metadata = await generateRuleMetadata(ruleText);
            return { index, metadata, nodeId: node.attrs.id };
          } catch (error) {
            console.error(`Failed to generate metadata for rule ${index}:`, error);
            return null;
          }
        });

        const results = await Promise.all(metadataPromises);

        // Update the editor with generated metadata
        results.forEach((result) => {
          if (result && result.metadata) {
            // Find the node in the current document and update it
            editor.chain().command(({ tr, state }) => {
              const { doc } = state;
              let nodePos: number | null = null;

              doc.descendants((node, pos) => {
                if (node.type.name === "rule" && node.attrs.id === result.nodeId) {
                  nodePos = pos;
                  return false; // Stop searching
                }
              });

              if (nodePos !== null) {
                tr.setNodeMarkup(nodePos, undefined, {
                  ...doc.nodeAt(nodePos)?.attrs,
                  metadata: result.metadata,
                });
              }

              return true;
            }).run();
          }
        });

        // Clear processing state
        setProcessingNodes(new Set());
      }

      // Save the document
      await onSave(title, editor.getJSON());
      toastSuccess({ description: "Rules saved successfully!" });
    } catch (error) {
      toastError({
        description: error instanceof Error ? error.message : "Failed to save rules",
      });
    } finally {
      setIsSaving(false);
    }
  }, [editor, title, onSave, generateRuleMetadata]);

  const toggleExpandAll = useCallback(() => {
    const newExpandedState = !showAllExpanded;
    setShowAllExpanded(newExpandedState);
    globalExpandedState = newExpandedState;
    
    // Clear or populate the expanded nodes set
    if (newExpandedState) {
      // Find all rule nodes and add them to expanded set
      editor?.state.doc.descendants((node) => {
        if (node.type.name === "rule" && node.attrs.id && node.attrs.metadata) {
          expandedNodes.add(node.attrs.id);
        }
      });
    } else {
      expandedNodes.clear();
    }
    
    // Force editor update
    editor?.view.dispatch(editor.state.tr);
  }, [showAllExpanded, editor]);

  if (!editor) {
    return (
      <div className="space-y-4 p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3 sm:px-8 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="max-w-full border-none bg-transparent text-xl font-semibold focus:outline-none focus:ring-0 sm:max-w-md sm:text-2xl"
            placeholder="Document title"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpandAll}
              title={showAllExpanded ? "Collapse all" : "Expand all"}
              className="hidden sm:flex"
            >
              {showAllExpanded ? (
                <EyeOffIcon className="h-4 w-4" />
              ) : (
                <EyeIcon className="h-4 w-4" />
              )}
              <span className="ml-2">{showAllExpanded ? "Collapse" : "Expand"} All</span>
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              size="sm"
              className="sm:size-auto"
            >
              <SaveIcon className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save & Process"}
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2 sm:px-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().insertRule().run()}
          className="gap-1 sm:gap-2"
        >
          <ZapIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Rule</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().insertContext().run()}
          className="gap-1 sm:gap-2"
        >
          <BookOpenIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Context</span>
        </Button>
        <div className="ml-auto hidden text-xs text-muted-foreground sm:block sm:text-sm">
          Type <kbd className="rounded bg-muted px-1">/rule</kbd> or{" "}
          <kbd className="rounded bg-muted px-1">/context</kbd> to insert
        </div>
        {/* Mobile expand/collapse button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleExpandAll}
          title={showAllExpanded ? "Collapse all" : "Expand all"}
          className="ml-auto sm:hidden"
        >
          {showAllExpanded ? (
            <EyeOffIcon className="h-4 w-4" />
          ) : (
            <EyeIcon className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl">
          <EditorContent 
            editor={editor} 
            className="min-h-[400px] px-4 py-4 sm:px-8 sm:py-6"
          />
        </div>
      </div>

      {/* Status bar */}
      {processingNodes.size > 0 && (
        <div className="border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground sm:px-8 sm:text-sm">
          Processing {processingNodes.size} rule{processingNodes.size !== 1 ? "s" : ""}...
        </div>
      )}
    </div>
  );
}

// Export the expanded nodes set for use in RuleNodeView
export { expandedNodes, globalExpandedState };