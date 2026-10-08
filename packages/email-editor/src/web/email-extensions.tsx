import { Extension, Node, type AnyExtension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyleKit } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { isSafeEmailUrl } from "../core/email-html";
import {
  PreservedBlockView,
  type RenderedPreservedEmailBlock,
} from "./preserved-block";
import styles from "./EmailEditor.module.css";
import { UrlHighlight } from "./url-highlight";

const PreservedEmailBlockNode = Node.create({
  name: "preservedEmailBlock",
  group: "block",
  atom: true,
  selectable: false,
  isolating: true,

  addAttributes() {
    return {
      id: { default: "" },
      kind: { default: "quote" },
      previewHtml: { default: "" },
    };
  },

  renderHTML() {
    return ["div", { "data-email-preserved-block": "" }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PreservedBlockNodeView);
  },
});

// Simple signatures are edited in place but keep the collapsible signature
// chrome. The Gmail container attribute lets a reopened draft find it again.
const EditableSignatureNode = Node.create({
  name: "editableEmailSignature",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  // Forward-delete from the reply would otherwise select the collapsed
  // signature and the next keystroke would replace it unseen.
  selectable: false,

  parseHTML() {
    return [{ tag: "div[data-smartmail]" }];
  },

  renderHTML() {
    return ["div", { "data-smartmail": "gmail_signature" }, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditableSignatureNodeView);
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

export function createEmailEditorExtensions(
  placeholder: string,
  extraExtensions: AnyExtension[] = [],
) {
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
    UrlHighlight,
    PreservedEmailBlockNode,
    EditableSignatureNode,
    TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
    Placeholder.configure({
      placeholder,
      showOnlyCurrent: true,
      showOnlyWhenEditable: true,
    }),
    ...extraExtensions,
  ];
}

function PreservedBlockNodeView({ node, deleteNode }: NodeViewProps) {
  const kind = node.attrs.kind === "signature" ? "signature" : "quote";
  const block: RenderedPreservedEmailBlock = {
    id: String(node.attrs.id ?? ""),
    kind,
    previewHtml: String(node.attrs.previewHtml ?? ""),
  };

  return (
    <NodeViewWrapper
      className={styles.preservedBlock}
      contentEditable={false}
      data-email-preserved-kind={kind}
    >
      <PreservedBlockView block={block} onRemove={deleteNode} />
    </NodeViewWrapper>
  );
}

function EditableSignatureNodeView({ deleteNode }: NodeViewProps) {
  return (
    <NodeViewWrapper
      className={styles.preservedBlock}
      data-email-preserved-kind="signature"
    >
      <PreservedBlockView
        block={EDITABLE_SIGNATURE_BLOCK}
        onRemove={deleteNode}
        signatureContent={
          <NodeViewContent
            className={styles.signatureHtml}
            data-email-signature-content=""
          />
        }
      />
    </NodeViewWrapper>
  );
}

const EDITABLE_SIGNATURE_BLOCK = {
  id: "signature",
  kind: "signature",
} as const;

function normalizeDirection(value: unknown): "ltr" | "rtl" | "auto" | null {
  return value === "ltr" || value === "rtl" || value === "auto" ? value : null;
}
