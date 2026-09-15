"use client";

import { Extension, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { exitSuggestion } from "@tiptap/suggestion";
import { forwardRef } from "react";
import {
  SnippetPicker,
  type SnippetPickerRef,
} from "@/components/snippets/SnippetPicker";
import {
  filterSnippets,
  normalizeSnippetQuery,
  type SnippetMatchItem,
} from "@/utils/snippets/match-snippets";

export type SnippetSlashItem =
  | { kind: "create"; shortcut: string }
  | { kind: "snippet"; snippet: SnippetMatchItem };

export function createSnippetSlashExtension({
  getSnippets,
  insertSnippet,
  onCreate,
}: {
  getSnippets: () => SnippetMatchItem[];
  insertSnippet: (snippet: SnippetMatchItem, range: Range) => void;
  onCreate: (input: { shortcut: string }) => void;
}) {
  const pluginKey = new PluginKey("snippetSlash");

  return Extension.create({
    name: "snippetSlash",

    addProseMirrorPlugins() {
      return [
        Suggestion<SnippetSlashItem>({
          editor: this.editor,
          char: "/",
          pluginKey,
          allowedPrefixes: [" "],
          items: ({ query }) => {
            const snippets = filterSnippets(getSnippets(), query);
            return [
              {
                kind: "create",
                shortcut: normalizeSnippetQuery(query),
              },
              ...snippets.map((snippet) => ({
                kind: "snippet" as const,
                snippet,
              })),
            ];
          },
          command: ({ editor, range, props }) => {
            if (props.kind === "create") {
              editor.chain().focus().deleteRange(range).run();
              onCreate({ shortcut: props.shortcut });
              return;
            }
            insertSnippet(props.snippet, range);
          },
          render: () => {
            let component: ReactRenderer<SnippetPickerRef> | undefined;
            let unmount: (() => void) | undefined;
            let onWindowKeyDown: ((event: KeyboardEvent) => void) | undefined;

            const cleanup = () => {
              if (onWindowKeyDown) {
                window.removeEventListener("keydown", onWindowKeyDown, true);
                onWindowKeyDown = undefined;
              }
              unmount?.();
              unmount = undefined;
              component?.destroy();
              component = undefined;
            };

            return {
              onStart: (props) => {
                component = new ReactRenderer(SnippetSlashPicker, {
                  editor: props.editor,
                  props,
                });
                component.element.style.zIndex = "100";
                unmount = props.mount(component.element);
                // Window capture runs before Radix's document listener, so
                // preventDefault keeps compose open and still dismisses the picker.
                onWindowKeyDown = (event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  exitSuggestion(props.editor.view, pluginKey);
                };
                window.addEventListener("keydown", onWindowKeyDown, true);
              },
              onUpdate: (props) => {
                component?.updateProps(props);
              },
              onKeyDown: (props) => component?.ref?.onKeyDown(props) ?? false,
              onExit: cleanup,
            };
          },
        }),
      ];
    },
  });
}

const SnippetSlashPicker = forwardRef<
  SnippetPickerRef,
  {
    command: (item: SnippetSlashItem) => void;
    items: SnippetSlashItem[];
    query: string;
  }
>(function SnippetSlashPicker({ command, items, query }, ref) {
  const snippets = items
    .filter(
      (item): item is Extract<SnippetSlashItem, { kind: "snippet" }> =>
        item.kind === "snippet",
    )
    .map((item) => item.snippet);
  const createItem = items.find((item) => item.kind === "create");

  return (
    <SnippetPicker
      onSelectCreate={() => {
        command({
          kind: "create",
          shortcut: createItem?.kind === "create" ? createItem.shortcut : "",
        });
      }}
      onSelectSnippet={(snippet) => {
        command({ kind: "snippet", snippet });
      }}
      query={query}
      ref={ref}
      snippets={snippets}
    />
  );
});
