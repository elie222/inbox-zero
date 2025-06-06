"use client";

import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useState } from "react";
import { BookOpen, Trash2 } from "lucide-react";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";

export function ContextNodeView({
  deleteNode,
}: {
  node: any;
  deleteNode: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <NodeViewWrapper
      className={cn(
        "relative my-2 rounded-lg border-2 border-blue-200 bg-blue-50 p-4 transition-all",
        "hover:border-blue-300 hover:shadow-sm",
        isHovered && "shadow-md",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-2">
        <BookOpen className="mt-1 h-4 w-4 flex-shrink-0 text-blue-600" />

        <div className="flex-1">
          <NodeViewContent className="prose-sm" />
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
