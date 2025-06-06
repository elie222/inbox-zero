"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, Trash2Icon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/Badge";
import { cn } from "@/utils";
import { ActionType } from "@prisma/client";
import { capitalCase } from "capital-case";
import { getActionColor } from "@/components/PlanBadge";
import TextareaAutosize from "react-textarea-autosize";

export interface RuleMetadata {
  name: string;
  actions: {
    type: ActionType;
    label?: string | null;
    subject?: string | null;
    content?: string | null;
    to?: string | null;
    cc?: string | null;
    bcc?: string | null;
    url?: string | null;
  }[];
}

interface RuleNodeProps {
  node: any;
  updateAttributes: (attrs: any) => void;
  deleteNode: () => void;
}

function RuleNodeComponent({ node, updateAttributes, deleteNode }: RuleNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const metadata = node.attrs.metadata as RuleMetadata | null;

  const updateMetadata = (newMetadata: RuleMetadata) => {
    updateAttributes({ metadata: newMetadata });
  };

  const updateAction = (index: number, field: string, value: string) => {
    if (!metadata) return;
    const newActions = [...metadata.actions];
    newActions[index] = { ...newActions[index], [field]: value };
    updateMetadata({ ...metadata, actions: newActions });
  };

  const deleteAction = (index: number) => {
    if (!metadata) return;
    const newActions = metadata.actions.filter((_, i) => i !== index);
    updateMetadata({ ...metadata, actions: newActions });
  };

  const addAction = () => {
    if (!metadata) return;
    const newActions = [...metadata.actions, { type: ActionType.LABEL }];
    updateMetadata({ ...metadata, actions: newActions });
  };

  return (
    <NodeViewWrapper
      className={cn(
        "relative my-4 rounded-lg border-2 border-green-200 bg-green-50 p-4 transition-all",
        "hover:border-green-300 hover:shadow-sm",
        "focus-within:border-green-400 focus-within:shadow-md"
      )}
    >
      <div className="flex items-start gap-2">
        <ZapIcon className="mt-1 h-5 w-5 text-green-600" />
        <div className="flex-1">
          {metadata && (
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <Input
                    value={metadata.name}
                    onChange={(e) => updateMetadata({ ...metadata, name: e.target.value })}
                    onBlur={() => setIsEditing(false)}
                    className="h-7 border-green-300 bg-white text-sm font-medium"
                    autoFocus
                  />
                ) : (
                  <h3
                    className="text-sm font-medium text-green-900 cursor-pointer hover:underline"
                    onClick={() => setIsEditing(true)}
                  >
                    {metadata.name}
                  </h3>
                )}
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-green-600 hover:text-green-700"
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={deleteNode}
                className="text-red-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2Icon className="h-4 w-4" />
              </button>
            </div>
          )}
          
          <NodeViewContent className="prose prose-sm max-w-none text-gray-700" />
          
          {!metadata && (
            <p className="mt-2 text-sm italic text-gray-500">
              AI will generate name and actions on save
            </p>
          )}

          {metadata && isExpanded && (
            <div className="mt-4 space-y-3 border-t border-green-200 pt-3">
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-gray-600">Actions</h4>
                {metadata.actions.map((action, index) => (
                  <div key={index} className="space-y-2 rounded-md border border-green-200 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <Badge
                        color={getActionColor(action.type)}
                        className="text-xs"
                      >
                        {capitalCase(action.type)}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => deleteAction(index)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2Icon className="h-3 w-3" />
                      </button>
                    </div>
                    
                    {action.type === ActionType.LABEL && (
                      <Input
                        value={action.label || ""}
                        onChange={(e) => updateAction(index, "label", e.target.value)}
                        placeholder="Label name"
                        className="h-8 text-sm"
                      />
                    )}
                    
                    {(action.type === ActionType.DRAFT_EMAIL || 
                      action.type === ActionType.REPLY || 
                      action.type === ActionType.SEND_EMAIL) && (
                      <div className="space-y-2">
                        {action.type === ActionType.SEND_EMAIL && (
                          <Input
                            value={action.to || ""}
                            onChange={(e) => updateAction(index, "to", e.target.value)}
                            placeholder="To"
                            className="h-8 text-sm"
                          />
                        )}
                        <Input
                          value={action.subject || ""}
                          onChange={(e) => updateAction(index, "subject", e.target.value)}
                          placeholder="Subject"
                          className="h-8 text-sm"
                        />
                        <TextareaAutosize
                          value={action.content || ""}
                          onChange={(e) => updateAction(index, "content", e.target.value)}
                          placeholder="Email content"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-black focus:ring-black"
                          minRows={2}
                        />
                      </div>
                    )}
                    
                    {action.type === ActionType.FORWARD && (
                      <Input
                        value={action.to || ""}
                        onChange={(e) => updateAction(index, "to", e.target.value)}
                        placeholder="Forward to"
                        className="h-8 text-sm"
                      />
                    )}
                    
                    {action.type === ActionType.CALL_WEBHOOK && (
                      <Input
                        value={action.url || ""}
                        onChange={(e) => updateAction(index, "url", e.target.value)}
                        placeholder="Webhook URL"
                        className="h-8 text-sm"
                      />
                    )}
                  </div>
                ))}
                
                <Button
                  type="button"
                  onClick={addAction}
                  size="sm"
                  variant="outline"
                  className="mt-2"
                >
                  Add Action
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const RuleNode = Node.create({
  name: "rule",
  group: "block",
  content: "text*",
  atom: false,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      metadata: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="rule"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "rule" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RuleNodeComponent);
  },
});