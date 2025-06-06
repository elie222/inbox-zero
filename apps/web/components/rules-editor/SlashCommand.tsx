"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("slashCommand"),
        state: {
          init() {
            return { active: false, query: "", pos: 0 };
          },
          apply(tr, state) {
            const { selection } = tr;
            const { $from } = selection;
            const textBefore = $from.parent.textBetween(
              Math.max(0, $from.parentOffset - 10),
              $from.parentOffset,
              null,
              "\ufffc"
            );

            const match = textBefore.match(/\/(\w*)$/);
            if (match) {
              return {
                active: true,
                query: match[1],
                pos: $from.pos - match[0].length,
              };
            }
            return { active: false, query: "", pos: 0 };
          },
        },
        props: {
          decorations(state) {
            const { active, query, pos } = this.getState(state);
            if (!active) return DecorationSet.empty;

            const commands = [
              { name: "rule", description: "Insert a rule block" },
              { name: "context", description: "Insert a context block" },
            ];

            const filtered = commands.filter((cmd) =>
              cmd.name.toLowerCase().startsWith(query.toLowerCase())
            );

            if (filtered.length === 0) return DecorationSet.empty;

            // Show inline suggestions
            const decoration = Decoration.widget(
              pos + query.length + 1,
              () => {
                const div = document.createElement("div");
                div.className = "slash-command-menu";
                div.style.cssText = `
                  position: absolute;
                  top: 100%;
                  left: 0;
                  background: white;
                  border: 1px solid #e5e7eb;
                  border-radius: 0.375rem;
                  padding: 0.25rem;
                  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                  z-index: 50;
                  min-width: 200px;
                `;

                filtered.forEach((cmd) => {
                  const item = document.createElement("div");
                  item.className = "slash-command-item";
                  item.style.cssText = `
                    padding: 0.5rem;
                    cursor: pointer;
                    border-radius: 0.25rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                  `;
                  item.innerHTML = `
                    <span style="font-weight: 500">/${cmd.name}</span>
                    <span style="color: #6b7280; font-size: 0.875rem">${cmd.description}</span>
                  `;
                  item.onmouseover = () => {
                    item.style.backgroundColor = "#f3f4f6";
                  };
                  item.onmouseout = () => {
                    item.style.backgroundColor = "transparent";
                  };
                  div.appendChild(item);
                });

                return div;
              },
              { side: 0 }
            );

            return DecorationSet.create(state.doc, [decoration]);
          },
        },
      }),
    ];
  },
});