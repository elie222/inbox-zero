"use client";

import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useState } from "react";
import { Zap, ChevronRight, ChevronDown, Trash2 } from "lucide-react";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ActionType } from "@prisma/client";
import type { RuleMetadata } from "../nodes/RuleNode";

export function RuleNodeView({
  node,
  deleteNode,
  updateAttributes,
}: {
  node: any;
  deleteNode: () => void;
  updateAttributes: (attrs: any) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const metadata = node.attrs.metadata as RuleMetadata | null;

  const handleMetadataUpdate = (updates: Partial<RuleMetadata>) => {
    if (metadata) {
      updateAttributes({
        metadata: { ...metadata, ...updates },
      });
    }
  };

  const handleActionUpdate = (index: number, updates: any) => {
    if (metadata) {
      const newActions = [...metadata.actions];
      newActions[index] = { ...newActions[index], ...updates };
      handleMetadataUpdate({ actions: newActions });
    }
  };

  const handleAddAction = () => {
    if (metadata) {
      handleMetadataUpdate({
        actions: [...metadata.actions, { type: ActionType.LABEL }],
      });
    }
  };

  const handleRemoveAction = (index: number) => {
    if (metadata) {
      handleMetadataUpdate({
        actions: metadata.actions.filter((_, i) => i !== index),
      });
    }
  };

  const getActionBadgeColor = (type: string) => {
    switch (type) {
      case ActionType.ARCHIVE:
        return "bg-gray-100 text-gray-800";
      case ActionType.LABEL:
        return "bg-blue-100 text-blue-800";
      case ActionType.DRAFT_EMAIL:
        return "bg-purple-100 text-purple-800";
      case ActionType.REPLY:
      case ActionType.SEND_EMAIL:
        return "bg-green-100 text-green-800";
      case ActionType.FORWARD:
        return "bg-orange-100 text-orange-800";
      case ActionType.MARK_READ:
        return "bg-indigo-100 text-indigo-800";
      case ActionType.MARK_SPAM:
        return "bg-red-100 text-red-800";
      case ActionType.CALL_WEBHOOK:
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <NodeViewWrapper
      className={cn(
        "relative my-2 rounded-lg border-2 border-green-200 bg-green-50 p-4 transition-all",
        "hover:border-green-300 hover:shadow-sm",
        isHovered && "shadow-md",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-2">
        <Zap className="mt-1 h-4 w-4 flex-shrink-0 text-green-600" />

        <div className="flex-1">
          {metadata && (
            <div className="mb-2 flex items-center gap-2">
              {metadata.actions.length > 0 && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="rounded p-1 transition-colors hover:bg-green-100"
                  type="button"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-green-600" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-green-600" />
                  )}
                </button>
              )}

              <Input
                value={metadata.name}
                onChange={(e) => handleMetadataUpdate({ name: e.target.value })}
                className="h-8 flex-1 border-green-200 bg-white text-sm font-medium"
                placeholder="Rule name"
              />
            </div>
          )}

          {!metadata && (
            <div className="mb-2 text-sm italic text-gray-500">
              AI will generate name and actions on save
            </div>
          )}

          <NodeViewContent className="prose-sm" />

          {metadata && isExpanded && (
            <div className="mt-4 space-y-3 border-t border-green-200 pt-4">
              <div className="text-sm font-medium text-gray-700">Actions:</div>

              {metadata.actions.map((action, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Badge
                    className={cn("mt-1", getActionBadgeColor(action.type))}
                  >
                    {action.type.toLowerCase().replace("_", " ")}
                  </Badge>

                  <div className="flex-1 space-y-2">
                    {action.type === ActionType.LABEL && (
                      <Input
                        value={action.label || ""}
                        onChange={(e) =>
                          handleActionUpdate(index, { label: e.target.value })
                        }
                        placeholder="Label name"
                        className="h-8 text-sm"
                      />
                    )}

                    {(action.type === ActionType.DRAFT_EMAIL ||
                      action.type === ActionType.REPLY ||
                      action.type === ActionType.SEND_EMAIL) && (
                      <textarea
                        value={action.content || ""}
                        onChange={(e) =>
                          handleActionUpdate(index, { content: e.target.value })
                        }
                        placeholder="Email content..."
                        className="w-full rounded border border-gray-200 p-2 text-sm"
                        rows={3}
                      />
                    )}

                    {action.type === ActionType.FORWARD && (
                      <Input
                        value={action.to || ""}
                        onChange={(e) =>
                          handleActionUpdate(index, { to: e.target.value })
                        }
                        placeholder="Forward to email"
                        className="h-8 text-sm"
                      />
                    )}

                    {action.type === ActionType.CALL_WEBHOOK && (
                      <Input
                        value={action.url || ""}
                        onChange={(e) =>
                          handleActionUpdate(index, { url: e.target.value })
                        }
                        placeholder="Webhook URL"
                        className="h-8 text-sm"
                      />
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveAction(index)}
                    className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <Button
                size="sm"
                variant="outline"
                onClick={handleAddAction}
                className="mt-2"
              >
                Add Action
              </Button>
            </div>
          )}
        </div>

        {isHovered && (
          <Button
            size="sm"
            variant="ghost"
            onClick={deleteNode}
            className="absolute right-2 top-2 h-8 w-8 p-0 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </NodeViewWrapper>
  );
}
