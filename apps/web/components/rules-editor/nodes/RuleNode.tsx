import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { RuleNodeView } from "./RuleNodeView";

export interface RuleMetadata {
  ruleName: string;
  actions: {
    type: string;
    content?: string;
    label?: string;
  }[];
}

export interface RuleNodeAttrs {
  content: string;
  metadata: RuleMetadata | null;
  id: string;
}

export const RuleNode = Node.create({
  name: "rule",
  group: "block",
  content: "text*",
  draggable: true,
  atom: false,

  addAttributes() {
    return {
      content: {
        default: "",
      },
      metadata: {
        default: null,
      },
      id: {
        default: () => `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

  addCommands() {
    return {
      insertRule:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              content: "",
              metadata: null,
            },
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-r": () => this.editor.commands.insertRule(),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("ruleSlashCommand"),
        props: {
          handleTextInput: (view, from, to, text) => {
            const { state } = view;
            const $from = state.selection.$from;
            
            // Check if we're at the start of a line
            if ($from.parentOffset === 0 && text === "/") {
              return false; // Let the slash command handler deal with it
            }
            
            // Check for /rule command
            const textBefore = state.doc.textBetween(
              Math.max(0, from - 5),
              from,
              " ",
            );
            
            if (textBefore + text === "/rule" || textBefore + text === "/rule ") {
              // Delete the slash command text
              view.dispatch(
                state.tr.delete(from - textBefore.length, to).insertContent({
                  type: "rule",
                  attrs: {
                    content: "",
                    metadata: null,
                  },
                }),
              );
              return true;
            }
            
            return false;
          },
        },
      }),
    ];
  },
});