import { Extension } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";

export const EnterHandler = Extension.create({
  name: "enterHandler",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown: (_view, event) => {
            // Check for Cmd/Ctrl + Enter
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              return true; // Prevent default behavior
            }
            return false;
          },
        },
      }),
    ];
  },
});
