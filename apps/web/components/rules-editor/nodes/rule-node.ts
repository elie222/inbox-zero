import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface RuleMetadata {
  ruleName: string;
  actions: Array<{
    type: string;
    label?: string;
    subject?: string;
    content?: string;
    to?: string;
    cc?: string;
    bcc?: string;
    url?: string;
  }>;
}

export interface RuleAttributes {
  content: string;
  metadata: RuleMetadata | null;
  expanded: boolean;
}

export const RuleNode = Node.create({
  name: "rule",

  group: "block",

  content: "text*",

  addAttributes() {
    return {
      content: {
        default: "",
      },
      metadata: {
        default: null,
      },
      expanded: {
        default: false,
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
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div");
      dom.setAttribute("data-type", "rule");
      dom.classList.add("rule-node");

      const contentWrapper = document.createElement("div");
      contentWrapper.classList.add("rule-content");
      contentWrapper.setAttribute("contenteditable", "true");

      dom.appendChild(contentWrapper);

      return {
        dom,
        contentDOM: contentWrapper,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) {
            return false;
          }
          return true;
        },
      };
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        const node = $from.node();

        if (node.type.name === this.name) {
          // Exit the rule node and create a new paragraph after it
          const pos = $from.after();
          return editor
            .chain()
            .setTextSelection(pos)
            .createParagraphNear()
            .focus()
            .run();
        }

        return false;
      },
    };
  },

  addCommands() {
    return {
      insertRule:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                content: "",
                metadata: null,
                expanded: false,
              },
            })
            .focus()
            .run();
        },
      
      updateRuleMetadata:
        (pos: number, metadata: RuleMetadata) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, {
              ...tr.doc.nodeAt(pos)?.attrs,
              metadata,
            });
            dispatch(tr);
          }
          return true;
        },

      toggleRuleExpanded:
        (pos: number) =>
        ({ tr, dispatch, state }) => {
          const node = state.doc.nodeAt(pos);
          if (node && node.type.name === this.name && dispatch) {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              expanded: !node.attrs.expanded,
            });
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            
            state.doc.descendants((node, pos) => {
              if (node.type.name === this.name && !node.attrs.metadata) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "rule-node-pending",
                  })
                );
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});