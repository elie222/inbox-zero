"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { BookOpenIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/utils";

interface ContextNodeProps {
  node: any;
  deleteNode: () => void;
}

function ContextNodeComponent({ deleteNode }: ContextNodeProps) {
  return (
    <NodeViewWrapper
      className={cn(
        "group relative my-4 rounded-lg border-2 border-blue-200 bg-blue-50 p-4 transition-all",
        "hover:border-blue-300 hover:shadow-sm",
        "focus-within:border-blue-400 focus-within:shadow-md"
      )}
    >
      <div className="flex items-start gap-2">
        <BookOpenIcon className="mt-1 h-5 w-5 text-blue-600" />
        <div className="flex-1">
          <NodeViewContent className="prose prose-sm max-w-none text-gray-700" />
        </div>
        <button
          type="button"
          onClick={deleteNode}
          className="text-red-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2Icon className="h-4 w-4" />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export const ContextNode = Node.create({
  name: "context",
  group: "block",
  content: "text*",
  atom: false,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="context"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "context" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ContextNodeComponent);
  },
});