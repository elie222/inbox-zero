import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ContextNodeView } from "../components/ContextNodeView";

export interface ContextAttributes {
  id: string;
  content: string;
}

export const ContextNode = Node.create({
  name: "context",
  group: "block",
  content: "inline*",
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
      },
      content: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="context"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "context" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ContextNodeView);
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-c": () => this.editor.commands.insertContext(),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    context: {
      insertContext: () => ReturnType;
    };
  }
}

export const ContextCommands = {
  insertContext:
    () =>
    ({ commands }: any) => {
      return commands.insertContent({
        type: "context",
        attrs: {
          id: `context-${Date.now()}`,
          content: "",
        },
      });
    },
};
