import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { find } from "linkifyjs";
import { isSafeEmailUrl } from "../core/email-html";

export const UrlHighlight = Extension.create({
  name: "urlHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        state: {
          init: (_, state) => findUrlHighlights(state.doc),
          apply: (transaction, decorations) =>
            transaction.docChanged
              ? findUrlHighlights(transaction.doc)
              : decorations,
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

export function findUrlHighlights(doc: Node) {
  const decorations: Decoration[] = [];
  doc.descendants((node, position) => {
    if (!node.isText || !node.text) return;
    if (node.marks.some((mark) => mark.type.name === "link")) return;

    for (const match of find(node.text, { defaultProtocol: "https" })) {
      if (!isSafeEmailUrl(match.href)) continue;
      decorations.push(
        Decoration.inline(position + match.start, position + match.end, {
          "data-email-url-highlight": "",
        }),
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}
