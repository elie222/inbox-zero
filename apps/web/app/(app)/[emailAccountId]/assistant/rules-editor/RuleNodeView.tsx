"use client";

import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useState } from "react";
import {
  ZapIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  Trash2Icon,
  PlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import type { RuleMetadata } from "./nodes";
import { cn } from "@/utils";
import { ActionType } from "@prisma/client";

const actionTypeColors: Record<string, string> = {
  [ActionType.ARCHIVE]: "bg-blue-100 text-blue-700",
  [ActionType.LABEL]: "bg-green-100 text-green-700",
  [ActionType.DRAFT_EMAIL]: "bg-purple-100 text-purple-700",
  [ActionType.REPLY]: "bg-indigo-100 text-indigo-700",
  [ActionType.SEND_EMAIL]: "bg-pink-100 text-pink-700",
  [ActionType.FORWARD]: "bg-yellow-100 text-yellow-700",
  [ActionType.MARK_READ]: "bg-gray-100 text-gray-700",
  [ActionType.MARK_SPAM]: "bg-red-100 text-red-700",
  [ActionType.CALL_WEBHOOK]: "bg-orange-100 text-orange-700",
  [ActionType.TRACK_THREAD]: "bg-teal-100 text-teal-700",
};

export function RuleNodeView({ node, updateAttributes, deleteNode }: any) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(node.attrs.metadata?.name || "");

  const metadata = node.attrs.metadata as RuleMetadata | null;

  const handleSaveName = () => {
    if (metadata) {
      updateAttributes({
        metadata: {
          ...metadata,
          name: tempName,
        },
      });
    }
    setEditingName(false);
  };

  const handleAddAction = () => {
    if (metadata) {
      updateAttributes({
        metadata: {
          ...metadata,
          actions: [...metadata.actions, { type: ActionType.LABEL, label: "" }],
        },
      });
    }
  };

  const handleUpdateAction = (
    index: number,
    updates: Partial<RuleMetadata["actions"][0]>,
  ) => {
    if (metadata) {
      const newActions = [...metadata.actions];
      newActions[index] = { ...newActions[index], ...updates };
      updateAttributes({
        metadata: {
          ...metadata,
          actions: newActions,
        },
      });
    }
  };

  const handleDeleteAction = (index: number) => {
    if (metadata) {
      updateAttributes({
        metadata: {
          ...metadata,
          actions: metadata.actions.filter((_, i) => i !== index),
        },
      });
    }
  };

  return (
    <NodeViewWrapper
      className={cn(
        "relative mb-4 rounded-lg border-2 border-green-200 bg-green-50 p-4 transition-all",
        "hover:border-green-300 hover:shadow-md",
        isHovered && "border-green-300 shadow-md",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-2">
          <ZapIcon className="h-5 w-5 text-green-600" />
          {metadata && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronRightIcon className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        <div className="flex-1">
          {metadata && !isExpanded && (
            <div className="mb-2 text-sm font-medium text-green-700">
              {metadata.name}
            </div>
          )}

          <NodeViewContent className="text-gray-700" />

          {!metadata && (
            <div className="mt-2 text-sm italic text-gray-500">
              AI will generate name and actions on save
            </div>
          )}

          {metadata && isExpanded && (
            <div className="mt-4 space-y-4 border-t border-green-200 pt-4">
              <div>
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      className="flex-1"
                      placeholder="Rule name..."
                    />
                    <Button size="sm" onClick={handleSaveName}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingName(false);
                        setTempName(metadata.name);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">Rule Name:</h4>
                    <span>{metadata.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingName(true)}
                    >
                      Edit
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-medium">Actions:</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddAction}
                    className="h-8"
                  >
                    <PlusIcon className="mr-1 h-3 w-3" />
                    Add Action
                  </Button>
                </div>
                <div className="space-y-2">
                  {metadata.actions.map((action, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded-md bg-white p-2"
                    >
                      <Badge
                        className={cn(
                          "capitalize",
                          actionTypeColors[action.type] || "bg-gray-100",
                        )}
                      >
                        {action.type.replace(/_/g, " ").toLowerCase()}
                      </Badge>

                      {action.type === ActionType.LABEL && (
                        <Input
                          value={action.label || ""}
                          onChange={(e) =>
                            handleUpdateAction(index, { label: e.target.value })
                          }
                          placeholder="Label name..."
                          className="flex-1"
                        />
                      )}

                      {action.type === ActionType.DRAFT_EMAIL && (
                        <textarea
                          value={action.content || ""}
                          onChange={(e) =>
                            handleUpdateAction(index, {
                              content: e.target.value,
                            })
                          }
                          placeholder="Email template..."
                          className="flex-1 rounded-md border border-gray-300 p-2"
                          rows={3}
                        />
                      )}

                      {action.type === ActionType.FORWARD && (
                        <Input
                          value={action.to || ""}
                          onChange={(e) =>
                            handleUpdateAction(index, { to: e.target.value })
                          }
                          placeholder="Forward to email..."
                          className="flex-1"
                        />
                      )}

                      {action.type === ActionType.CALL_WEBHOOK && (
                        <Input
                          value={action.url || ""}
                          onChange={(e) =>
                            handleUpdateAction(index, { url: e.target.value })
                          }
                          placeholder="Webhook URL..."
                          className="flex-1"
                        />
                      )}

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteAction(index)}
                        className="h-8 w-8"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {isHovered && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => deleteNode()}
            className="absolute right-2 top-2 h-8 w-8 opacity-0 transition-opacity hover:opacity-100"
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        )}
      </div>
    </NodeViewWrapper>
  );
}
