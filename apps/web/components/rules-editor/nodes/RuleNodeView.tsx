"use client";

import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useState, useEffect } from "react";
import { ChevronDownIcon, ChevronRightIcon, Trash2Icon, ZapIcon } from "lucide-react";
import { cn } from "@/utils";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionType } from "@prisma/client";
import type { NodeViewProps } from "@tiptap/react";
import type { RuleMetadata } from "./RuleNode";
import { expandedNodes, globalExpandedState } from "../RulesEditor";

export function RuleNodeView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const nodeId = node.attrs.id;
  const [isExpanded, setIsExpanded] = useState(() => 
    expandedNodes.has(nodeId) || globalExpandedState
  );
  const [isHovered, setIsHovered] = useState(false);
  const metadata = node.attrs.metadata as RuleMetadata | null;

  // Sync with global expanded state
  useEffect(() => {
    if (metadata) {
      if (globalExpandedState && !expandedNodes.has(nodeId)) {
        expandedNodes.add(nodeId);
        setIsExpanded(true);
      } else if (!globalExpandedState && expandedNodes.has(nodeId)) {
        expandedNodes.delete(nodeId);
        setIsExpanded(false);
      }
    }
  }, [globalExpandedState, nodeId, metadata]);

  const handleExpandToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    
    if (newExpanded) {
      expandedNodes.add(nodeId);
    } else {
      expandedNodes.delete(nodeId);
    }
  };

  const handleMetadataUpdate = (newMetadata: RuleMetadata) => {
    updateAttributes({ metadata: newMetadata });
  };

  const handleAddAction = () => {
    if (!metadata) return;
    
    const newMetadata: RuleMetadata = {
      ...metadata,
      actions: [...metadata.actions, { type: ActionType.LABEL, label: "" }],
    };
    handleMetadataUpdate(newMetadata);
  };

  const handleRemoveAction = (index: number) => {
    if (!metadata) return;
    
    const newMetadata: RuleMetadata = {
      ...metadata,
      actions: metadata.actions.filter((_, i) => i !== index),
    };
    handleMetadataUpdate(newMetadata);
  };

  const handleActionUpdate = (index: number, updates: Partial<RuleMetadata["actions"][0]>) => {
    if (!metadata) return;
    
    const newMetadata: RuleMetadata = {
      ...metadata,
      actions: metadata.actions.map((action, i) =>
        i === index ? { ...action, ...updates } : action
      ),
    };
    handleMetadataUpdate(newMetadata);
  };

  return (
    <NodeViewWrapper
      className={cn(
        "relative my-2 rounded-lg border-2 p-4 transition-all",
        "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20",
        selected && "ring-2 ring-green-500 ring-offset-2",
        "hover:border-green-300 dark:hover:border-green-700"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-2">
        <ZapIcon className="mt-1 h-5 w-5 text-green-600 dark:text-green-400" />
        
        <div className="flex-1">
          {/* Metadata section - only show if metadata exists */}
          {metadata && (
            <div className="mb-2">
              {isExpanded ? (
                <div className="space-y-3">
                  <Input
                    type="text"
                    name="ruleName"
                    label="Rule Name"
                    value={metadata.ruleName}
                    onChange={(e) =>
                      handleMetadataUpdate({ ...metadata, ruleName: e.target.value })
                    }
                    className="text-sm"
                  />
                  
                  <div>
                    <label className="mb-2 block text-sm font-medium">Actions</label>
                    <div className="space-y-2">
                      {metadata.actions.map((action, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {action.type}
                          </Badge>
                          {action.type === ActionType.LABEL && (
                            <Input
                              type="text"
                              name={`action-${index}`}
                              value={action.label || ""}
                              onChange={(e) =>
                                handleActionUpdate(index, { label: e.target.value })
                              }
                              placeholder="Label name"
                              className="flex-1 text-sm"
                            />
                          )}
                          {action.type === ActionType.DRAFT_EMAIL && (
                            <textarea
                              value={action.content || ""}
                              onChange={(e) =>
                                handleActionUpdate(index, { content: e.target.value })
                              }
                              placeholder="Email template..."
                              className="flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm"
                              rows={2}
                            />
                          )}
                          {action.type === ActionType.ARCHIVE && (
                            <span className="text-sm text-muted-foreground">
                              Archive email
                            </span>
                          )}
                          <button
                            onClick={() => handleRemoveAction(index)}
                            className="text-destructive hover:text-destructive/80"
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleAddAction}
                      className="mt-2"
                    >
                      Add Action
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium">{metadata.ruleName}</span>
                  <span>•</span>
                  <span>{metadata.actions.length} action{metadata.actions.length !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          )}
          
          {/* Placeholder when no metadata */}
          {!metadata && (
            <div className="mb-2 text-sm italic text-muted-foreground">
              AI will generate name and actions on save
            </div>
          )}

          {/* Content editor */}
          <NodeViewContent className="min-h-[1.5rem] outline-none" />
        </div>

        {/* Controls */}
        {isHovered && (
          <div className="flex items-center gap-1">
            {metadata && (
              <button
                onClick={handleExpandToggle}
                className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                {isExpanded ? (
                  <ChevronDownIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </button>
            )}
            <button
              onClick={deleteNode}
              className="rounded p-1 text-destructive hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <Trash2Icon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}