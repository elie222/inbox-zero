import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { RuleNodeView } from "./RuleNodeView";
import { ContextNodeView } from "./ContextNodeView";

export interface RuleMetadata {
  name: string;
  actions: {
    type: string;
    label?: string;
    subject?: string;
    content?: string;
    to?: string;
    url?: string;
  }[];
}

export interface RuleNodeAttrs {
  content: string;
  metadata: RuleMetadata | null;
  id: string;
}

export interface ContextNodeAttrs {
  content: string;
  id: string;
}

export const RuleNode = Node.create({
  name: "rule",
  group: "block",
  content: "text*",
  draggable: true,

  addAttributes() {
    return {
      content: {
        default: "",
      },
      metadata: {
        default: null,
      },
      id: {
        default: () => `rule-${Math.random().toString(36).substr(2, 9)}`,
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
    return ReactNodeViewRenderer(RuleNodeView);
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => false, // Prevent default mod+enter behavior
    };
  },
});

export const ContextNode = Node.create({
  name: "context",
  group: "block",
  content: "text*",
  draggable: true,

  addAttributes() {
    return {
      content: {
        default: "",
      },
      id: {
        default: () => `context-${Math.random().toString(36).substr(2, 9)}`,
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
});
