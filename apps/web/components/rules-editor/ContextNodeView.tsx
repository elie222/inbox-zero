"use client";

import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { BookOpen, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";

interface ContextNodeViewProps {
  node: any;
  deleteNode: () => void;
}

export function ContextNodeView({ node, deleteNode }: ContextNodeViewProps) {
  const [hovering, setHovering] = useState(false);

  return (
    <NodeViewWrapper
      className={cn(
        "context-node relative mb-4 rounded-lg border-2 border-blue-200 bg-blue-50/50 p-4 transition-all",
        "hover:border-blue-300 hover:shadow-sm",
        hovering && "shadow-md"
      )}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="flex items-start gap-2">
        <BookOpen className="mt-1 h-4 w-4 text-blue-600 flex-shrink-0" />
        
        <div className="flex-1">
          <NodeViewContent className="context-content text-gray-700" />
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