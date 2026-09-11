import { ReactRenderer } from "@tiptap/react";
import { Mention } from "@tiptap/extension-mention";
import type { MarkdownToken } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { MentionList, type MentionListRef } from "./MentionList";
import type { EmailLabel } from "@/providers/email-label-types";

const MAX_SUGGESTIONS = 10;

export const createLabelMentionExtension = (labels: EmailLabel[]) => {
  return Mention.configure({
    HTMLAttributes: {
      class: "mention-label",
    },
    renderLabel({ node }) {
      return `${node.attrs.label ?? node.attrs.id}`;
    },
    suggestion: {
      char: "@",
      pluginKey: new PluginKey("labelMention"),
      items: ({ query }) => {
        const filteredLabels = labels
          .filter((label) =>
            label.name.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, MAX_SUGGESTIONS);

        // If there's a query and no exact match exists, add option to create new label
        // Case-insensitive comparison to prevent duplicate entries with different casing
        const exactMatchExists = labels.some(
          (label) => label.name.toLowerCase() === query.toLowerCase(),
        );

        if (query && !exactMatchExists) {
          return [
            ...filteredLabels,
            {
              id: `__create_new__${query.toLowerCase()}`,
              name: query,
              gmailLabelId: undefined,
              enabled: true,
              isCreateNew: true,
            },
          ];
        }

        return filteredLabels;
      },
      render: () => {
        let component: ReactRenderer<MentionListRef>;
        let popup: HTMLElement;

        // Cleanup function to ensure proper cleanup
        const cleanup = () => {
          try {
            if (popup?.parentNode) {
              popup.parentNode.removeChild(popup);
            }
            if (component) {
              component.destroy();
            }
          } catch (error) {
            // Silently handle cleanup errors to prevent crashes
            console.warn("Error during mention cleanup:", error);
          }
        };

        return {
          onStart: (props) => {
            try {
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

              // Add error boundary for cleanup
              window.addEventListener("beforeunload", cleanup);
            } catch (error) {
              console.error("Error during mention start:", error);
              cleanup();
            }
          },

          onUpdate(props) {
            try {
              // More defensive checks to prevent race conditions
              if (!component?.updateProps || !popup) {
                console.warn("Mention component or popup not ready for update");
                return;
              }

              component.updateProps(props);

              if (!props.clientRect) {
                return;
              }

              const rect = props.clientRect();
              if (rect) {
                popup.style.top = `${rect.bottom + 8}px`;
                popup.style.left = `${rect.left}px`;
              }
            } catch (error) {
              console.error("Error during mention update:", error);
              cleanup();
            }
          },

          onKeyDown(props) {
            if (props.event.key === "Escape") {
              cleanup();
              return true;
            }

            try {
              return component.ref?.onKeyDown(props) ?? false;
            } catch (error) {
              console.error("Error during mention keydown:", error);
              cleanup();
              return false;
            }
          },

          onExit() {
            // Remove beforeunload listener
            window.removeEventListener("beforeunload", cleanup);
            cleanup();
          },
        };
      },
      command: ({ editor, range, props }) => {
        const nodeAfter = editor.view.state.selection.$to.nodeAfter;
        // Fix type error by adding proper type guards
        const overrideSpace =
          nodeAfter &&
          typeof nodeAfter.text === "string" &&
          nodeAfter.text.startsWith(" ");

        if (overrideSpace) {
          range.to += 1;
        }

        const label = props as EmailLabel & { isCreateNew?: boolean };
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
    markdownTokenName: "mention",
    markdownTokenizer: {
      name: "mention",
      level: "inline",
      start: "@[",
      tokenize: (source) => {
        if (!source.startsWith("@[")) return;

        const end = source.indexOf("]", 2);
        if (end < 3) return;

        const raw = source.slice(0, end + 1);
        return {
          type: "mention",
          raw,
          label: raw.slice(2, -1),
        };
      },
    },
    parseMarkdown(token: MarkdownToken) {
      const labelName = typeof token.label === "string" ? token.label : "";
      const label = labels.find((item) => item.name === labelName);
      return {
        type: this.name,
        attrs: {
          id: label?.id ?? `__placeholder__${labelName.toLowerCase()}`,
          label: labelName,
        },
      };
    },
    renderMarkdown(node) {
      return `@[${node.attrs?.label ?? node.attrs?.id ?? ""}]`;
    },
  });
};
