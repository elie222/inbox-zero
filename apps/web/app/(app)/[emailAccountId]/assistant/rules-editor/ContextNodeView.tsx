"use client";

import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useState } from "react";
import { BookOpenIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

export function ContextNodeView({ deleteNode }: any) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <NodeViewWrapper
      className={cn(
        "relative mb-4 rounded-lg border-2 border-blue-200 bg-blue-50 p-4 transition-all",
        "hover:border-blue-300 hover:shadow-md",
        isHovered && "border-blue-300 shadow-md",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-3">
        <BookOpenIcon className="h-5 w-5 text-blue-600" />

        <div className="flex-1">
          <NodeViewContent className="text-gray-700" />
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
