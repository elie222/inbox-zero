import { Node, mergeAttributes } from "@tiptap/core";

export const ContextNode = Node.create({
  name: "context",

  group: "block",

  content: "text*",

  addAttributes() {
    return {
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
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "context" }), 0];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div");
      dom.setAttribute("data-type", "context");
      dom.classList.add("context-node");

      const contentWrapper = document.createElement("div");
      contentWrapper.classList.add("context-content");
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
          // Exit the context node and create a new paragraph after it
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
      insertContext:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                content: "",
              },
            })
            .focus()
            .run();
        },
    };
  },
});