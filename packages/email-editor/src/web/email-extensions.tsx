import { Extension, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { isSafeEmailUrl } from "../core/email-html";
import {
  PreservedBlockDetails,
  type RenderedPreservedEmailBlock,
} from "./preserved-block";
import styles from "./EmailEditor.module.css";

const PreservedEmailBlockNode = Node.create({
  name: "preservedEmailBlock",
  group: "block",
  atom: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      id: { default: "" },
      kind: { default: "quote" },
      previewHtml: { default: "" },
      collapsed: { default: true },
    };
  },

  renderHTML() {
    return ["div", { "data-email-preserved-block": "" }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PreservedBlockNodeView);
  },
});

const EmailImage = Image.extend({
  name: "emailImage",
  inline: true,
  group: "inline",

  addAttributes() {
    return {
      ...this.parent?.(),
      contentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-content-id"),
        renderHTML: (attributes) =>
          attributes.contentId
            ? { "data-content-id": attributes.contentId }
            : {},
      },
    };
  },
}).configure({
  allowBase64: false,
});

const EmailDirection = Extension.create({
  name: "emailDirection",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "blockquote", "bulletList", "orderedList"],
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) =>
              normalizeDirection(element.getAttribute("dir")),
            renderHTML: (attributes) => {
              const direction = normalizeDirection(attributes.dir);
              return direction ? { dir: direction } : {};
            },
          },
        },
      },
    ];
  },
});

export function createEmailEditorExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      dropcursor: false,
      gapcursor: false,
      heading: false,
      horizontalRule: false,
      trailingNode: false,
      bulletList: { keepMarks: true, keepAttributes: true },
      orderedList: { keepMarks: true, keepAttributes: true },
      link: {
        autolink: true,
        defaultProtocol: "https",
        enableClickSelection: true,
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
        isAllowedUri: (url, context) =>
          context.defaultValidate(url) && isSafeEmailUrl(url),
      },
    }),
    EmailImage,
    EmailDirection,
    PreservedEmailBlockNode,
    Placeholder.configure({
      placeholder,
      showOnlyCurrent: true,
      showOnlyWhenEditable: true,
    }),
  ];
}

function PreservedBlockNodeView({ node, deleteNode }: NodeViewProps) {
  const kind = node.attrs.kind === "signature" ? "signature" : "quote";
  const block: RenderedPreservedEmailBlock = {
    id: String(node.attrs.id ?? ""),
    kind,
    previewHtml: String(node.attrs.previewHtml ?? ""),
    collapsed: Boolean(node.attrs.collapsed),
  };

  return (
    <NodeViewWrapper
      className={styles.preservedBlock}
      contentEditable={false}
      data-email-preserved-kind={kind}
    >
      <PreservedBlockDetails block={block} onRemove={deleteNode} />
    </NodeViewWrapper>
  );
}

function normalizeDirection(value: unknown): "ltr" | "rtl" | "auto" | null {
  return value === "ltr" || value === "rtl" || value === "auto" ? value : null;
}
