"use client";

import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useState } from "react";
import { BookOpenIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/utils";
import type { NodeViewProps } from "@tiptap/react";

export function ContextNodeView({
  node,
  deleteNode,
  selected,
}: NodeViewProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <NodeViewWrapper
      className={cn(
        "relative my-2 rounded-lg border-2 p-4 transition-all",
        "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20",
        selected && "ring-2 ring-blue-500 ring-offset-2",
        "hover:border-blue-300 dark:hover:border-blue-700"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-2">
        <BookOpenIcon className="mt-1 h-5 w-5 text-blue-600 dark:text-blue-400" />
        
        <div className="flex-1">
          <NodeViewContent className="min-h-[1.5rem] outline-none" />
        </div>

        {/* Controls */}
        {isHovered && (
          <button
            onClick={deleteNode}
            className="rounded p-1 text-destructive hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <Trash2Icon className="h-4 w-4" />
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}