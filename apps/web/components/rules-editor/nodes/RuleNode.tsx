import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { RuleNodeView } from "../components/RuleNodeView";

export interface RuleMetadata {
  name: string;
  actions: Array<{
    type: string;
    content?: string;
    label?: string;
    to?: string;
    cc?: string;
    bcc?: string;
    url?: string;
  }>;
}

export interface RuleAttributes {
  id: string;
  content: string;
  metadata: RuleMetadata | null;
}

export const RuleNode = Node.create({
  name: "rule",
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
      metadata: {
        default: null,
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
      "Mod-Alt-r": () => this.editor.commands.insertRule(),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    rule: {
      insertRule: () => ReturnType;
      updateRuleMetadata: (id: string, metadata: RuleMetadata) => ReturnType;
    };
  }
}

export const RuleCommands = {
  insertRule:
    () =>
    ({ commands }: any) => {
      return commands.insertContent({
        type: "rule",
        attrs: {
          id: `rule-${Date.now()}`,
          content: "",
          metadata: null,
        },
      });
    },
  updateRuleMetadata:
    (id: string, metadata: RuleMetadata) =>
    ({ commands, state }: any) => {
      const { doc } = state;
      let pos: number | null = null;

      doc.descendants((node: any, nodePos: number) => {
        if (node.type.name === "rule" && node.attrs.id === id) {
          pos = nodePos;
          return false;
        }
      });

      if (pos !== null) {
        return commands.updateAttributes("rule", { metadata }, { from: pos });
      }

      return false;
    },
};
