import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ContextNodeView } from "./ContextNodeView";

export interface ContextNodeAttrs {
  content: string;
  id: string;
}

export const ContextNode = Node.create({
  name: "context",
  group: "block",
  content: "text*",
  draggable: true,
  atom: false,

  addAttributes() {
    return {
      content: {
        default: "",
      },
      id: {
        default: () => `context-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "context" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ContextNodeView);
  },

  addCommands() {
    return {
      insertContext:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              content: "",
            },
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-c": () => this.editor.commands.insertContext(),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("contextSlashCommand"),
        props: {
          handleTextInput: (view, from, to, text) => {
            const { state } = view;
            const $from = state.selection.$from;
            
            // Check if we're at the start of a line
            if ($from.parentOffset === 0 && text === "/") {
              return false; // Let the slash command handler deal with it
            }
            
            // Check for /context command
            const textBefore = state.doc.textBetween(
              Math.max(0, from - 8),
              from,
              " ",
            );
            
            if (textBefore + text === "/context" || textBefore + text === "/context ") {
              // Delete the slash command text
              view.dispatch(
                state.tr.delete(from - textBefore.length, to).insertContent({
                  type: "context",
                  attrs: {
                    content: "",
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