import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy from "tippy.js";
import { ZapIcon, BookOpenIcon } from "lucide-react";

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

export const SlashCommandsList = ({ items, command }: any) => {
  const selectItem = (index: number) => {
    const item = items[index];
    if (item) {
      command(item);
    }
  };

  return (
    <div className="z-50 overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
      {items.map((item: any, index: number) => (
        <button
          key={index}
          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-100"
          onClick={() => selectItem(index)}
        >
          {item.icon}
          <div>
            <div className="font-medium">{item.title}</div>
            <div className="text-sm text-gray-500">{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
};

export const getSuggestionItems = ({ query }: { query: string }) => {
  return [
    {
      title: "Rule",
      description: "Add a new rule",
      icon: <ZapIcon className="h-5 w-5 text-green-600" />,
      command: ({ editor, range }: any) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "rule",
            content: [{ type: "text", text: "" }],
          })
          .run();
      },
    },
    {
      title: "Context",
      description: "Add context information",
      icon: <BookOpenIcon className="h-5 w-5 text-blue-600" />,
      command: ({ editor, range }: any) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "context",
            content: [{ type: "text", text: "" }],
          })
          .run();
      },
    },
  ].filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
};

export const createSlashCommandsPlugin = () => ({
  suggestion: {
    items: getSuggestionItems,
    render: () => {
      let component: any;
      let popup: any;

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(SlashCommandsList, {
            props,
            editor: props.editor,
          });

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },
        onUpdate(props: any) {
          component.updateProps(props);

          popup[0].setProps({
            getReferenceClientRect: props.clientRect,
          });
        },
        onKeyDown(props: any) {
          if (props.event.key === "Escape") {
            popup[0].hide();
            return true;
          }
          return component.ref?.onKeyDown(props);
        },
        onExit() {
          popup[0].destroy();
          component.destroy();
        },
      };
    },
  },
});
