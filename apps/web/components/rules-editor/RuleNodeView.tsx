"use client";

import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { ChevronRight, ChevronDown, Zap, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { RuleMetadata } from "./nodes/rule-node";

interface RuleNodeViewProps {
  node: any;
  updateAttributes: (attrs: any) => void;
  deleteNode: () => void;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  ARCHIVE: "Archive",
  LABEL: "Label",
  REPLY: "Reply",
  SEND_EMAIL: "Send Email",
  FORWARD: "Forward",
  DRAFT_EMAIL: "Draft Email",
  MARK_SPAM: "Mark as Spam",
  CALL_WEBHOOK: "Call Webhook",
  MARK_READ: "Mark as Read",
  TRACK_THREAD: "Track Thread",
};

export function RuleNodeView({ node, updateAttributes, deleteNode }: RuleNodeViewProps) {
  const metadata = node.attrs.metadata as RuleMetadata | null;
  const expanded = node.attrs.expanded;
  const [hovering, setHovering] = useState(false);

  const toggleExpanded = () => {
    updateAttributes({ expanded: !expanded });
  };

  const updateMetadata = (updates: Partial<RuleMetadata>) => {
    if (!metadata) return;
    updateAttributes({
      metadata: { ...metadata, ...updates },
    });
  };

  const updateAction = (index: number, updates: any) => {
    if (!metadata) return;
    const newActions = [...metadata.actions];
    newActions[index] = { ...newActions[index], ...updates };
    updateMetadata({ actions: newActions });
  };

  const removeAction = (index: number) => {
    if (!metadata) return;
    const newActions = metadata.actions.filter((_, i) => i !== index);
    updateMetadata({ actions: newActions });
  };

  return (
    <NodeViewWrapper 
      className={cn(
        "rule-node relative mb-4 rounded-lg border-2 border-green-200 bg-green-50/50 p-4 transition-all",
        "hover:border-green-300 hover:shadow-sm",
        hovering && "shadow-md"
      )}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="flex items-start gap-2">
        <Zap className="mt-1 h-4 w-4 text-green-600 flex-shrink-0" />
        
        <div className="flex-1">
          {metadata && (
            <div className="mb-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={toggleExpanded}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                
                {expanded ? (
                  <Input
                    value={metadata.ruleName}
                    onChange={(e) => updateMetadata({ ruleName: e.target.value })}
                    className="h-7 text-sm font-medium"
                    placeholder="Rule name"
                  />
                ) : (
                  <span className="text-sm font-medium text-gray-700">
                    {metadata.ruleName}
                  </span>
                )}
              </div>
            </div>
          )}

          <NodeViewContent className="rule-content text-gray-700" />

          {!metadata && (
            <p className="mt-2 text-sm italic text-gray-500">
              AI will generate name and actions on save
            </p>
          )}

          {metadata && expanded && (
            <div className="mt-4 space-y-3 border-t pt-4">
              <h4 className="text-sm font-medium">Actions</h4>
              
              {metadata.actions.map((action, index) => (
                <div key={index} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">
                      {ACTION_TYPE_LABELS[action.type] || action.type}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAction(index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  {action.type === "DRAFT_EMAIL" && (
                    <Textarea
                      value={action.content || ""}
                      onChange={(e) => updateAction(index, { content: e.target.value })}
                      placeholder="Email template..."
                      className="min-h-[100px]"
                    />
                  )}
                  
                  {action.type === "LABEL" && (
                    <Input
                      value={action.label || ""}
                      onChange={(e) => updateAction(index, { label: e.target.value })}
                      placeholder="Label name"
                    />
                  )}
                  
                  {action.type === "FORWARD" && (
                    <Input
                      value={action.to || ""}
                      onChange={(e) => updateAction(index, { to: e.target.value })}
                      placeholder="Forward to email"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {hovering && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2 h-6 w-6 p-0 opacity-60 hover:opacity-100"
            onClick={deleteNode}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </NodeViewWrapper>
  );
}