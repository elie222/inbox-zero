"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useCallback, forwardRef, useImperativeHandle, useState, useEffect } from "react";
import { cn } from "@/utils";
import { RuleNode } from "./nodes/RuleNode";
export type { RuleMetadata } from "./nodes/RuleNode";
import { ContextNode } from "./nodes/ContextNode";
import { Button } from "@/components/ui/button";
import { ZapIcon, BookOpenIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { toast } from "sonner";

export interface RulesEditorHandle {
  getJSON: () => any;
  processNewRules: () => Promise<void>;
  toggleAllMetadata: () => void;
}

interface RulesEditorProps {
  initialContent?: any;
  onChange?: (content: any) => void;
  onSave?: (content: any) => Promise<void>;
  generateRuleMetadata?: (ruleContent: string) => Promise<RuleMetadata>;
  documentTitle?: string;
  onTitleChange?: (title: string) => void;
}

// Slash commands extension
const SlashCommands = Extension.create({
  name: "slashCommands",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (event.key === "/") {
              const { state } = view;
              const { $from } = state.selection;
              
              // Check if we're at the start of a new line
              if ($from.nodeBefore === null || $from.nodeBefore.isText === false) {
                // Show slash menu (simplified for now)
                setTimeout(() => {
                  const menu = document.getElementById("slash-menu");
                  if (menu) {
                    menu.style.display = "block";
                  }
                }, 0);
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});

export const RulesEditor = forwardRef<RulesEditorHandle, RulesEditorProps>(
  function RulesEditor(
    { initialContent, onChange, onSave, generateRuleMetadata, documentTitle, onTitleChange },
    ref
  ) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [showAllMetadata, setShowAllMetadata] = useState(false);
    const [showSlashMenu, setShowSlashMenu] = useState(false);
    const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          blockquote: false,
        }),
        RuleNode,
        ContextNode,
        SlashCommands,
        Markdown,
      ],
      content: initialContent || {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Start typing or use / for commands..." }],
          },
        ],
      },
      onUpdate: ({ editor }) => {
        const json = editor.getJSON();
        onChange?.(json);
      },
      editorProps: {
        handleKeyDown: (view, event) => {
          if (event.key === "/" && view.state.selection.$from.parent.type.name === "paragraph") {
            const coords = view.coordsAtPos(view.state.selection.from);
            setSlashMenuPosition({ top: coords.top + 20, left: coords.left });
            setShowSlashMenu(true);
            return true;
          }
          
          if (showSlashMenu && event.key === "Escape") {
            setShowSlashMenu(false);
            return true;
          }
          
          return false;
        },
      },
    });

    const insertRule = useCallback(() => {
      if (!editor) return;
      editor.chain().focus().insertContent({
        type: "rule",
        content: [{ type: "text", text: "" }],
      }).run();
      setShowSlashMenu(false);
    }, [editor]);

    const insertContext = useCallback(() => {
      if (!editor) return;
      editor.chain().focus().insertContent({
        type: "context",
        content: [{ type: "text", text: "" }],
      }).run();
      setShowSlashMenu(false);
    }, [editor]);

    const processNewRules = useCallback(async () => {
      if (!editor || !generateRuleMetadata) return;

      setIsProcessing(true);
      const json = editor.getJSON();
      let hasChanges = false;

      try {
        // Process all rule nodes that don't have metadata
        const processNode = async (node: any, path: number[]): Promise<any> => {
          if (node.type === "rule" && !node.attrs?.metadata && node.content) {
            const ruleContent = node.content
              .filter((n: any) => n.type === "text")
              .map((n: any) => n.text)
              .join("");

            if (ruleContent.trim()) {
              const metadata = await generateRuleMetadata(ruleContent);
              hasChanges = true;
              return {
                ...node,
                attrs: { ...node.attrs, metadata },
              };
            }
          }

          if (node.content) {
            const newContent = await Promise.all(
              node.content.map((child: any, index: number) =>
                processNode(child, [...path, index])
              )
            );
            return { ...node, content: newContent };
          }

          return node;
        };

        const processedDoc = await processNode(json, []);
        
        if (hasChanges) {
          editor.commands.setContent(processedDoc);
          toast.success("Rules processed successfully!");
        }
      } catch (error) {
        toast.error("Failed to process rules");
        console.error("Error processing rules:", error);
      } finally {
        setIsProcessing(false);
      }
    }, [editor, generateRuleMetadata]);

    const toggleAllMetadata = useCallback(() => {
      setShowAllMetadata((prev) => !prev);
      // This would need to communicate with the rule nodes to expand/collapse
      // For now, we'll use a CSS approach or pass it through context
    }, []);

    useImperativeHandle(ref, () => ({
      getJSON: () => editor?.getJSON() || null,
      processNewRules,
      toggleAllMetadata,
    }));

    const handleSave = useCallback(async () => {
      if (!editor || !onSave) return;
      
      await processNewRules();
      const content = editor.getJSON();
      await onSave(content);
    }, [editor, onSave, processNewRules]);

    // Hide slash menu when clicking outside
    useEffect(() => {
      const handleClickOutside = () => setShowSlashMenu(false);
      if (showSlashMenu) {
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
      }
    }, [showSlashMenu]);

    return (
      <div className="relative w-full">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <input
            type="text"
            value={documentTitle || ""}
            onChange={(e) => onTitleChange?.(e.target.value)}
            placeholder="Document title..."
            className="text-2xl font-bold outline-none"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllMetadata}
              disabled={!editor}
            >
              {showAllMetadata ? (
                <>
                  <EyeOffIcon className="mr-2 h-4 w-4" />
                  Hide Metadata
                </>
              ) : (
                <>
                  <EyeIcon className="mr-2 h-4 w-4" />
                  Show Metadata
                </>
              )}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!editor || isProcessing}
              loading={isProcessing}
            >
              Save & Process
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex items-center gap-2 rounded-lg border bg-gray-50 p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={insertRule}
            disabled={!editor}
          >
            <ZapIcon className="mr-2 h-4 w-4 text-green-600" />
            Rule
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={insertContext}
            disabled={!editor}
          >
            <BookOpenIcon className="mr-2 h-4 w-4 text-blue-600" />
            Context
          </Button>
          <div className="ml-auto text-xs text-gray-500">
            Tip: Type / for commands
          </div>
        </div>

        {/* Editor */}
        <div className="relative rounded-md border border-input bg-background">
          <EditorContent
            editor={editor}
            className={cn(
              "min-h-[400px] px-4 py-3",
              showAllMetadata && "show-all-metadata"
            )}
          />
          
          {/* Slash menu */}
          {showSlashMenu && (
            <div
              id="slash-menu"
              className="absolute z-10 rounded-md border bg-white shadow-lg"
              style={{ top: slashMenuPosition.top, left: slashMenuPosition.left }}
            >
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-gray-100"
                onClick={insertRule}
              >
                <ZapIcon className="h-4 w-4 text-green-600" />
                <div>
                  <div className="font-medium">Rule</div>
                  <div className="text-xs text-gray-500">Add a new rule</div>
                </div>
              </button>
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-gray-100"
                onClick={insertContext}
              >
                <BookOpenIcon className="h-4 w-4 text-blue-600" />
                <div>
                  <div className="font-medium">Context</div>
                  <div className="text-xs text-gray-500">Add context information</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Status indicators */}
        {isProcessing && (
          <div className="mt-2 text-sm text-gray-500">
            Processing rules with AI...
          </div>
        )}
      </div>
    );
  }
);