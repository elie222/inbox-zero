import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SlashCommand {
  name: string;
  command: string;
  description: string;
  action: (editor: any) => void;
}

const slashCommands: SlashCommand[] = [
  {
    name: "Rule",
    command: "/rule",
    description: "Insert a new rule",
    action: (editor) => editor.chain().insertRule().run(),
  },
  {
    name: "Context",
    command: "/context",
    description: "Insert context information",
    action: (editor) => editor.chain().insertContext().run(),
  },
];

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        decorationTag: "span",
        decorationClass: "slash-command-menu",
        command: ({ editor, range, props }: any) => {
          props.action(editor);
          editor.chain().deleteRange(range).run();
        },
        items: ({ query }: { query: string }) => {
          return slashCommands.filter((item) =>
            item.command.toLowerCase().startsWith(query.toLowerCase())
          );
        },
      },
    };
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey("slashCommands");
    const { suggestion } = this.options;

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init() {
            return {
              active: false,
              range: null,
              query: null,
              items: [],
            };
          },
          apply(transaction, previousState, oldState, newState) {
            const { selection } = newState;
            const { $from } = selection;
            const { char } = suggestion;

            const textBefore = $from.parent.textBetween(
              Math.max(0, $from.parentOffset - 100),
              $from.parentOffset,
              undefined,
              "\ufffc"
            );

            const match = textBefore.match(new RegExp(`${char}([\\w/]*)$`));

            if (match) {
              const query = match[1];
              const items = suggestion.items({ query });
              const range = {
                from: $from.pos - match[0].length,
                to: $from.pos,
              };

              return {
                active: true,
                range,
                query,
                items,
              };
            }

            return {
              active: false,
              range: null,
              query: null,
              items: [],
            };
          },
        },
        props: {
          handleKeyDown(view, event) {
            const state = pluginKey.getState(view.state);

            if (!state.active) return false;

            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              // Handle menu navigation
              return true;
            }

            if (event.key === "Enter") {
              const firstItem = state.items[0];
              if (firstItem) {
                suggestion.command({
                  editor: view,
                  range: state.range,
                  props: firstItem,
                });
                return true;
              }
            }

            if (event.key === "Escape") {
              // Close the menu
              return true;
            }

            return false;
          },
          decorations(state) {
            const pluginState = pluginKey.getState(state);

            if (!pluginState.active) {
              return DecorationSet.empty;
            }

            return DecorationSet.create(
              state.doc,
              [
                Decoration.inline(
                  pluginState.range.from,
                  pluginState.range.to,
                  {
                    class: "slash-command-trigger",
                  }
                ),
              ]
            );
          },
        },
        view() {
          return {
            update: (view) => {
              const state = pluginKey.getState(view.state);
              
              // Here you would update your React component that shows the menu
              // This will be handled by the React component
            },
          };
        },
      }),
    ];
  },
});