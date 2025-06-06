"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useState, useEffect } from "react";
import { RuleNode } from "./nodes/rule-node";
import { ContextNode } from "./nodes/context-node";
import { SlashCommands } from "./extensions/slash-commands";
import { RuleNodeView } from "./RuleNodeView";
import { ContextNodeView } from "./ContextNodeView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, BookOpen, Save, Eye, EyeOff } from "lucide-react";
import { cn } from "@/utils";
import type { RuleMetadata } from "./nodes/rule-node";

interface RulesEditorProps {
  initialContent?: any;
  initialTitle?: string;
  onSave?: (title: string, content: any) => Promise<void>;
  onGenerateMetadata?: (ruleContent: string) => Promise<RuleMetadata>;
}

export function RulesEditor({
  initialContent,
  initialTitle = "Untitled Rules Document",
  onSave,
  onGenerateMetadata,
}: RulesEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [showAllExpanded, setShowAllExpanded] = useState(false);
  const [processingNodes, setProcessingNodes] = useState<Set<number>>(new Set());

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable default nodes that conflict with our custom ones
        paragraph: {
          HTMLAttributes: {
            class: "mb-4 text-gray-700",
          },
        },
      }),
      RuleNode.extend({
        addNodeView() {
          return ({ node, getPos, editor }) => {
            const container = document.createElement("div");

            const updateNode = () => {
              const pos = typeof getPos === "function" ? getPos() : null;
              if (pos !== null) {
                const Component = () => (
                  <RuleNodeView
                    node={node}
                    updateAttributes={(attrs) => {
                      editor.chain().updateAttributes("rule", attrs).run();
                    }}
                    deleteNode={() => {
                      editor.chain().deleteNode("rule").run();
                    }}
                  />
                );
                // This is a simplified version - in production you'd use ReactDOM.render or a proper React integration
              }
            };

            updateNode();
            
            return {
              dom: container,
              update: updateNode,
            };
          };
        },
      }),
      ContextNode.extend({
        addNodeView() {
          return ({ node, getPos, editor }) => {
            const container = document.createElement("div");

            const updateNode = () => {
              const pos = typeof getPos === "function" ? getPos() : null;
              if (pos !== null) {
                const Component = () => (
                  <ContextNodeView
                    node={node}
                    deleteNode={() => {
                      editor.chain().deleteNode("context").run();
                    }}
                  />
                );
                // This is a simplified version - in production you'd use ReactDOM.render or a proper React integration
              }
            };

            updateNode();
            
            return {
              dom: container,
              update: updateNode,
            };
          };
        },
      }),
      SlashCommands,
    ],
    content: initialContent || "",
    autofocus: true,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[400px] p-4",
      },
    },
  });

  const handleSave = useCallback(async () => {
    if (!editor || !onSave) return;
    
    setSaving(true);
    const json = editor.getJSON();
    
    // Process rules without metadata
    if (onGenerateMetadata && json.content) {
      const newProcessingNodes = new Set<number>();
      
      // First pass: identify nodes that need processing
      json.content.forEach((node, index) => {
        if (node.type === "rule" && !node.attrs?.metadata) {
          newProcessingNodes.add(index);
        }
      });
      
      setProcessingNodes(newProcessingNodes);
      
      // Process each rule node
      for (let i = 0; i < json.content.length; i++) {
        const node = json.content[i];
        if (node.type === "rule" && !node.attrs?.metadata && node.content?.[0]?.text) {
          try {
            const metadata = await onGenerateMetadata(node.content[0].text);
            
            // Update the node in the editor
            const pos = editor.state.doc.resolve(0);
            let currentPos = 0;
            editor.state.doc.descendants((descNode, descPos) => {
              if (descNode.type.name === "rule" && currentPos === i) {
                editor.commands.updateRuleMetadata(descPos, metadata);
                return false;
              }
              if (descNode.type.name === "rule" || descNode.type.name === "context") {
                currentPos++;
              }
            });
            
            // Update the JSON for saving
            json.content[i].attrs = {
              ...json.content[i].attrs,
              metadata,
            };
          } catch (error) {
            console.error("Failed to generate metadata for rule:", error);
          }
        }
      }
      
      setProcessingNodes(new Set());
    }
    
    await onSave(title, json);
    setSaving(false);
  }, [editor, title, onSave, onGenerateMetadata]);

  const toggleAllExpanded = useCallback(() => {
    if (!editor) return;
    
    const newExpanded = !showAllExpanded;
    setShowAllExpanded(newExpanded);
    
    // Toggle all rule nodes
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "rule" && node.attrs.metadata) {
        editor.commands.toggleRuleExpanded(pos);
      }
    });
  }, [editor, showAllExpanded]);

  const insertRule = useCallback(() => {
    editor?.chain().focus().insertRule().run();
  }, [editor]);

  const insertContext = useCallback(() => {
    editor?.chain().focus().insertContext().run();
  }, [editor]);

  useEffect(() => {
    // Add CSS for the custom nodes
    const style = document.createElement("style");
    style.textContent = `
      .rule-node-pending {
        position: relative;
      }
      .rule-node-pending::after {
        content: '';
        position: absolute;
        inset: -2px;
        border: 2px dashed #10b981;
        border-radius: 0.5rem;
        opacity: 0.5;
        animation: pulse 2s infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 0.8; }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  if (!editor) {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-white p-4">
        <div className="flex items-center justify-between">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="max-w-md text-lg font-semibold"
            placeholder="Document title"
          />
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllExpanded}
              disabled={!editor}
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
              disabled={saving || !onSave}
              className="bg-green-600 hover:bg-green-700"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Processing..." : "Save & Process"}
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="border-b bg-gray-50 p-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={insertRule}
            className="border-green-200 hover:bg-green-50"
          >
            <Zap className="mr-2 h-4 w-4 text-green-600" />
            Add Rule
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={insertContext}
            className="border-blue-200 hover:bg-blue-50"
          >
            <BookOpen className="mr-2 h-4 w-4 text-blue-600" />
            Add Context
          </Button>
          
          <div className="ml-4 text-sm text-gray-500">
            Tip: Type <code className="rounded bg-gray-200 px-1">/rule</code> or{" "}
            <code className="rounded bg-gray-200 px-1">/context</code> to insert
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto bg-white">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Status bar */}
      {processingNodes.size > 0 && (
        <div className="border-t bg-yellow-50 p-2 text-center text-sm text-yellow-800">
          Processing {processingNodes.size} rule{processingNodes.size > 1 ? "s" : ""}...
        </div>
      )}
    </div>
  );
}