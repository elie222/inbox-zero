import { ReactRenderer } from "@tiptap/react";
import { Mention } from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import { MentionList, type MentionListRef } from "./MentionList";
import type { UserLabel } from "@/hooks/useLabels";

export const createLabelMentionExtension = (labels: UserLabel[]) => {
  return Mention.configure({
    HTMLAttributes: {
      class: "mention-label",
    },
    renderText({ options, node }) {
      return `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`;
    },
    suggestion: {
      char: "@",
      pluginKey: new PluginKey("labelMention"),
      items: ({ query }) => {
        return labels
          .filter((label) =>
            label.name.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 10); // Limit to 10 suggestions
      },
      render: () => {
        let component: ReactRenderer<MentionListRef>;
        let popup: HTMLElement;

        return {
          onStart: (props) => {
            component = new ReactRenderer(MentionList, {
              props,
              editor: props.editor,
            });

            popup = document.createElement("div");
            popup.className = "mention-suggestions";
            popup.style.position = "absolute";
            popup.style.zIndex = "1000";
            popup.appendChild(component.element);

            document.body.appendChild(popup);
          },

          onUpdate(props) {
            component.updateProps(props);

            if (!props.clientRect) {
              return;
            }

            const rect = props.clientRect();
            if (rect) {
              popup.style.top = `${rect.bottom + 8}px`;
              popup.style.left = `${rect.left}px`;
            }
          },

          onKeyDown(props) {
            if (props.event.key === "Escape") {
              popup.remove();
              return true;
            }

            return component.ref?.onKeyDown(props) ?? false;
          },

          onExit() {
            popup?.remove();
            component?.destroy();
          },
        };
      },
      command: ({ editor, range, props }) => {
        const nodeAfter = editor.view.state.selection.$to.nodeAfter;
        const overrideSpace = nodeAfter?.text?.startsWith(" ");

        if (overrideSpace) {
          range.to += 1;
        }

        const label = props as UserLabel;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: "mention",
              attrs: {
                id: label.id,
                label: label.name,
              },
            },
            {
              type: "text",
              text: " ",
            },
          ])
          .run();

        window.getSelection()?.collapseToEnd();
      },
    },
  }).extend({
    addStorage() {
      return {
        markdown: {
          serialize: (state: any, node: any) => {
            state.write(`@[${node.attrs.label || node.attrs.id}]`);
          },
          parse: {
            // Register a custom markdown-it rule to parse @[labelName] back to mention nodes
            setup: (markdownIt: any) => {
              markdownIt.inline.ruler.push(
                "mention",
                (state: any, silent: boolean) => {
                  const start = state.pos;
                  const max = state.posMax;

                  // Check if we're at @[
                  if (start + 2 >= max) return false;
                  if (state.src.charCodeAt(start) !== 0x40 /* @ */)
                    return false;
                  if (state.src.charCodeAt(start + 1) !== 0x5b /* [ */)
                    return false;

                  // Find the closing ]
                  let pos = start + 2;
                  while (
                    pos < max &&
                    state.src.charCodeAt(pos) !== 0x5d /* ] */
                  ) {
                    pos++;
                  }

                  if (pos >= max) return false;

                  const labelName = state.src.slice(start + 2, pos);

                  // Find the label in our labels array
                  const label = labels.find((l) => l.name === labelName);
                  if (!label) return false;

                  if (!silent) {
                    const token = state.push("mention_open", "mention", 1);
                    token.attrs = [
                      ["id", label.id],
                      ["label", label.name],
                    ];

                    const textToken = state.push("text", "", 0);
                    textToken.content = `@${label.name}`;

                    state.push("mention_close", "mention", -1);
                  }

                  state.pos = pos + 1;
                  return true;
                },
              );
            },
          },
        },
      };
    },
  });
};
