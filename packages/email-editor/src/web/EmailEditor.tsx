"use client";

import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { DOMSerializer, Fragment, type Node } from "@tiptap/pm/model";
import {
  isSafeEmailUrl,
  sanitizePreservedEmailHtmlForPreview,
} from "../core/email-html";
import { createEmailEditorExtensions } from "./email-extensions";
import {
  PreservedBlockDetails,
  type RenderedPreservedEmailBlock,
} from "./preserved-block";
import styles from "./EmailEditor.module.css";

export type EmailEditorValue = {
  editableHtml: string;
  inlineContentIds: string[];
  mode: "rich" | "fallback";
  preservedBlockIds: string[];
};

export type EmailEditorState = Omit<EmailEditorValue, "editableHtml">;

export type EmailEditorPreservedBlock = {
  id: string;
  kind: "quote" | "signature";
  html: string;
  collapsed?: boolean;
};

export type EmailEditorHandle = {
  focus: () => void;
  getValue: () => EmailEditorValue;
  insertInlineImage: (image: {
    alt: string;
    contentId: string;
    previewUrl: string;
  }) => boolean;
  removeInlineImage: (contentId: string) => boolean;
};

export type EmailEditorProps = {
  initialHtml: string;
  mode?: "rich" | "fallback";
  preservedBlocks?: EmailEditorPreservedBlock[];
  unsupported?: string[];
  placeholder?: string;
  autofocus?: boolean;
  onStateChange?: (state: EmailEditorState) => void;
  onImageFiles?: (files: File[]) => void;
};

export const EmailEditor = forwardRef<EmailEditorHandle, EmailEditorProps>(
  function EmailEditor(
    {
      initialHtml,
      mode = "rich",
      preservedBlocks = [],
      unsupported = [],
      placeholder = "Write a message…",
      autofocus = true,
      onStateChange,
      onImageFiles,
    },
    ref,
  ) {
    const [initialState] = useState(() => ({
      initialHtml,
      mode,
      placeholder,
      autofocus,
      preservedBlocks: preservedBlocks.map((block) => ({
        collapsed: block.collapsed,
        id: block.id,
        kind: block.kind,
        previewHtml: sanitizePreservedEmailHtmlForPreview(block.html),
      })),
      unsupported,
    }));

    if (initialState.mode === "fallback") {
      return (
        <FallbackEmailEditor
          ref={ref}
          autofocus={initialState.autofocus}
          initialHtml={initialState.initialHtml}
          onStateChange={onStateChange}
          preservedBlocks={initialState.preservedBlocks}
          unsupported={initialState.unsupported}
        />
      );
    }

    return (
      <RichEmailEditor
        ref={ref}
        autofocus={initialState.autofocus}
        initialHtml={initialState.initialHtml}
        onStateChange={onStateChange}
        onImageFiles={onImageFiles}
        placeholder={initialState.placeholder}
        preservedBlocks={initialState.preservedBlocks}
      />
    );
  },
);

const RichEmailEditor = forwardRef<
  EmailEditorHandle,
  Required<
    Pick<EmailEditorProps, "autofocus" | "initialHtml" | "placeholder">
  > &
    Pick<EmailEditorProps, "onStateChange" | "onImageFiles"> & {
      preservedBlocks: RenderedPreservedEmailBlock[];
    }
>(function RichEmailEditor(
  {
    autofocus,
    initialHtml,
    onStateChange,
    onImageFiles,
    placeholder,
    preservedBlocks,
  },
  ref,
) {
  const onStateChangeRef = useRef(onStateChange);
  const onImageFilesRef = useRef(onImageFiles);
  onStateChangeRef.current = onStateChange;
  onImageFilesRef.current = onImageFiles;

  const [linkPanel, setLinkPanel] = useState<{
    from: number;
    href: string;
    to: number;
  } | null>(null);
  const [linkHref, setLinkHref] = useState("");
  const [linkError, setLinkError] = useState("");
  const linkInputId = useId();
  const linkErrorId = `${linkInputId}-error`;

  const emitChange = useCallback((editor: Editor) => {
    onStateChangeRef.current?.(getRichEditorState(editor));
  }, []);

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions: createEmailEditorExtensions(placeholder),
      content: initialHtml,
      editorProps: {
        attributes: {
          "aria-label": "Email message",
          "aria-multiline": "true",
          "data-email-editor-content": "",
          dir: "auto",
          role: "textbox",
        },
        handleClick: (_view, _position, event) => {
          const link = (event.target as HTMLElement | null)?.closest("a");
          if (!(link instanceof HTMLAnchorElement)) return false;
          if (!(event.metaKey || event.ctrlKey)) return false;

          event.preventDefault();
          openSafeLink(link.href);
          return true;
        },
        handleDrop: (_view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? []).filter(
            (file) => file.type.startsWith("image/"),
          );
          if (!files.length || !onImageFilesRef.current) return false;
          event.preventDefault();
          onImageFilesRef.current(files);
          return true;
        },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter(
            (file) => file.type.startsWith("image/"),
          );
          if (!files.length || !onImageFilesRef.current) return false;
          event.preventDefault();
          onImageFilesRef.current(files);
          return true;
        },
      },
      onCreate: ({ editor: createdEditor }) => {
        const selectionPosition = createdEditor.state.doc.content.size;
        createdEditor.commands.setTextSelection(selectionPosition);
        if (preservedBlocks.length) {
          createdEditor.commands.insertContentAt(
            selectionPosition,
            preservedBlocks.map((block) => ({
              type: "preservedEmailBlock",
              attrs: block,
            })),
            { updateSelection: false },
          );
        }
        if (autofocus) createdEditor.commands.focus();
        emitChange(createdEditor);
      },
      onUpdate: ({ editor: updatedEditor }) => emitChange(updatedEditor),
    },
    [],
  );

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      blockquote: currentEditor?.isActive("blockquote") ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      canRedo: currentEditor?.can().redo() ?? false,
      canUndo: currentEditor?.can().undo() ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      link: currentEditor?.isActive("link") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
      direction: currentEditor
        ? getActiveBlockDirection(currentEditor)
        : undefined,
      strike: currentEditor?.isActive("strike") ?? false,
      underline: currentEditor?.isActive("underline") ?? false,
    }),
  });

  const openLinkPanel = useCallback(() => {
    if (!editor) return;
    if (editor.isActive("link")) editor.commands.extendMarkRange("link");
    const { from, to } = editor.state.selection;
    const href = String(editor.getAttributes("link").href ?? "");
    setLinkPanel({ from, href, to });
    setLinkHref(href);
    setLinkError("");
  }, [editor]);

  const closeLinkPanel = useCallback(() => {
    setLinkPanel(null);
    setLinkError("");
    editor?.commands.focus();
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor || !linkPanel) return;
    const href = normalizeLinkHref(linkHref);
    if (!href || !isSafeEmailUrl(href)) {
      setLinkError("Enter a safe web, email, telephone, or in-message link.");
      return;
    }

    if (linkPanel.from === linkPanel.to) {
      editor
        .chain()
        .focus()
        .setTextSelection(linkPanel.from)
        .insertContent({
          type: "text",
          text: href,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: linkPanel.from, to: linkPanel.to })
        .setLink({ href })
        .run();
    }
    setLinkPanel(null);
    setLinkError("");
  }, [editor, linkHref, linkPanel]);

  const removeLink = useCallback(() => {
    if (!editor || !linkPanel) return;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: linkPanel.from, to: linkPanel.to })
      .unsetLink()
      .run();
    setLinkPanel(null);
  }, [editor, linkPanel]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus(),
      getValue: () =>
        editor
          ? getRichEditorValue(editor)
          : emptyEditorValue("rich", initialHtml),
      insertInlineImage: ({ alt, contentId, previewUrl }) => {
        if (!editor) return false;
        return editor
          .chain()
          .focus()
          .insertContent({
            type: "emailImage",
            attrs: { alt, contentId, src: previewUrl, title: alt },
          })
          .run();
      },
      removeInlineImage: (contentId) => {
        if (!editor) return false;
        return editor.commands.command(({ dispatch, state, tr }) => {
          const imagePositions: Array<{ from: number; to: number }> = [];
          state.doc.descendants((node, position) => {
            if (
              node.type.name === "emailImage" &&
              node.attrs.contentId === contentId
            ) {
              imagePositions.push({
                from: position,
                to: position + node.nodeSize,
              });
            }
          });
          if (!imagePositions.length) return false;

          for (const image of imagePositions.reverse()) {
            tr.delete(image.from, image.to);
          }
          dispatch?.(tr);
          return true;
        });
      },
    }),
    [editor, initialHtml],
  );

  if (!editor) return <div className={styles.surface} aria-busy="true" />;

  return (
    <div
      className={styles.surface}
      data-email-editor-root
      data-email-editor-mode="rich"
      onKeyDownCapture={(event) => {
        const target = event.target;
        if (
          !(target instanceof Element) ||
          !target.closest("[data-email-editor-content]")
        ) {
          return;
        }
        if (
          event.key.toLowerCase() !== "k" ||
          !(event.metaKey || event.ctrlKey)
        ) {
          return;
        }
        event.preventDefault();
        openLinkPanel();
      }}
    >
      <div className={styles.editor}>
        <EditorContent editor={editor} />
      </div>

      <BubbleMenu
        editor={editor}
        options={{ offset: 8, placement: "top" }}
        shouldShow={({ from, to }) => from !== to || editor.isActive("link")}
      >
        <div
          aria-label="Selection formatting"
          className={styles.bubbleToolbar}
          role="toolbar"
        >
          <MarkButtons
            editor={editor}
            onLink={openLinkPanel}
            state={toolbarState}
          />
        </div>
      </BubbleMenu>

      <div
        aria-label="Email formatting"
        className={styles.toolbar}
        role="toolbar"
      >
        <MarkButtons
          editor={editor}
          onLink={openLinkPanel}
          state={toolbarState}
        />
        <span aria-hidden className={styles.separator} />
        <ToolbarButton
          active={toolbarState?.bulletList}
          label="Bulleted list"
          onPress={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          active={toolbarState?.orderedList}
          label="Numbered list"
          onPress={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          active={toolbarState?.blockquote}
          label="Block quote"
          onPress={() => editor.chain().focus().toggleBlockquote().run()}
        >
          “ ”
        </ToolbarButton>
        <span aria-hidden className={styles.separator} />
        <ToolbarButton
          active={toolbarState?.direction === "ltr"}
          label="Left-to-right text"
          onPress={() => setBlockDirection(editor, "ltr")}
        >
          LTR
        </ToolbarButton>
        <ToolbarButton
          active={toolbarState?.direction === "rtl"}
          label="Right-to-left text"
          onPress={() => setBlockDirection(editor, "rtl")}
        >
          RTL
        </ToolbarButton>
        <span aria-hidden className={styles.separator} />
        <ToolbarButton
          disabled={!toolbarState?.canUndo}
          label="Undo"
          onPress={() => editor.chain().focus().undo().run()}
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          disabled={!toolbarState?.canRedo}
          label="Redo"
          onPress={() => editor.chain().focus().redo().run()}
        >
          ↷
        </ToolbarButton>
      </div>

      {linkPanel && (
        <div
          aria-label={linkPanel.href ? "Edit link" : "Add link"}
          className={styles.linkPanel}
          role="dialog"
        >
          <label htmlFor={linkInputId}>Link address</label>
          <input
            aria-describedby={linkError ? linkErrorId : undefined}
            aria-invalid={Boolean(linkError)}
            autoFocus
            className={styles.linkInput}
            id={linkInputId}
            onChange={(event) => setLinkHref(event.target.value)}
            placeholder="https://example.com"
            type="text"
            value={linkHref}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeLinkPanel();
                return;
              }
              if (event.key !== "Enter") return;
              event.preventDefault();
              applyLink();
            }}
          />
          {linkError && (
            <p className={styles.linkError} id={linkErrorId} role="alert">
              {linkError}
            </p>
          )}
          <div className={styles.linkActions}>
            {linkPanel.href && (
              <button
                className={styles.toolbarButton}
                onClick={() => openSafeLink(linkPanel.href)}
                type="button"
              >
                Open
              </button>
            )}
            {linkPanel.href && (
              <button
                className={styles.toolbarButton}
                onClick={removeLink}
                type="button"
              >
                Remove
              </button>
            )}
            <button
              className={styles.toolbarButton}
              onClick={closeLinkPanel}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.toolbarButton}
              onClick={applyLink}
              type="button"
            >
              {linkPanel.href ? "Update" : "Add"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

const FallbackEmailEditor = forwardRef<
  EmailEditorHandle,
  Pick<
    EmailEditorProps,
    "autofocus" | "initialHtml" | "onStateChange" | "unsupported"
  > & {
    preservedBlocks: RenderedPreservedEmailBlock[];
  }
>(function FallbackEmailEditor(
  { autofocus, initialHtml, onStateChange, preservedBlocks, unsupported = [] },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeBlocks, setActiveBlocks] = useState(preservedBlocks);
  const currentHtmlRef = useRef(initialHtml);
  const [safeInitialHtml] = useState(() =>
    sanitizePreservedEmailHtmlForPreview(initialHtml),
  );

  const getValue = useCallback(
    (): EmailEditorValue => ({
      editableHtml: currentHtmlRef.current,
      inlineContentIds: [],
      mode: "fallback",
      preservedBlockIds: activeBlocks.map((block) => block.id),
    }),
    [activeBlocks],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editorRef.current?.focus(),
      getValue,
      insertInlineImage: () => false,
      removeInlineImage: () => false,
    }),
    [getValue],
  );

  return (
    <div
      className={styles.surface}
      data-email-editor-root
      data-email-editor-mode="fallback"
    >
      <p className={styles.fallbackWarning} role="status">
        This draft contains provider formatting that rich editing cannot safely
        represent ({unsupported.join(", ")}). Sending it unchanged preserves the
        original HTML; editing may simplify unsupported formatting.
      </p>
      <div
        aria-label="Email message"
        aria-multiline="true"
        autoFocus={autofocus}
        className={styles.fallbackEditor}
        contentEditable
        // biome-ignore lint/security/noDangerouslySetInnerHtml: core sanitization removes active content before this lossless fallback is rendered.
        dangerouslySetInnerHTML={{ __html: safeInitialHtml }}
        dir="auto"
        onInput={(event) => {
          currentHtmlRef.current = event.currentTarget.innerHTML;
        }}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
        tabIndex={0}
      />
      {activeBlocks.map((block) => (
        <StandalonePreservedBlock
          block={block}
          key={block.id}
          onRemove={() => {
            const next = activeBlocks.filter(
              (candidate) => candidate.id !== block.id,
            );
            setActiveBlocks(next);
            onStateChange?.({
              inlineContentIds: [],
              mode: "fallback",
              preservedBlockIds: next.map((candidate) => candidate.id),
            });
          }}
        />
      ))}
    </div>
  );
});

function MarkButtons({
  editor,
  onLink,
  state,
}: {
  editor: Editor;
  onLink: () => void;
  state: {
    bold: boolean;
    italic: boolean;
    link: boolean;
    strike: boolean;
    underline: boolean;
  } | null;
}) {
  return (
    <>
      <ToolbarButton
        active={state?.bold}
        label="Bold"
        onPress={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        active={state?.italic}
        label="Italic"
        onPress={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        active={state?.underline}
        label="Underline"
        onPress={() => editor.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton
        active={state?.strike}
        label="Strikethrough"
        onPress={() => editor.chain().focus().toggleStrike().run()}
      >
        <s>S</s>
      </ToolbarButton>
      <ToolbarButton
        active={state?.link}
        label="Add or edit link"
        onPress={onLink}
      >
        Link
      </ToolbarButton>
    </>
  );
}

function ToolbarButton({
  active,
  children,
  disabled = false,
  label,
  onPress,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`${styles.toolbarButton} ${active ? styles.toolbarButtonActive : ""}`}
      disabled={disabled}
      onClick={onPress}
      onMouseDown={(event) => event.preventDefault()}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function StandalonePreservedBlock({
  block,
  onRemove,
}: {
  block: RenderedPreservedEmailBlock;
  onRemove: () => void;
}) {
  return (
    <div className={styles.preservedBlock} contentEditable={false}>
      <PreservedBlockDetails block={block} onRemove={onRemove} />
    </div>
  );
}

function getRichEditorValue(editor: Editor): EmailEditorValue {
  const { editableContent, inlineContentIds, preservedBlockIds } =
    inspectRichEditorDocument(editor);

  const container = window.document.createElement("div");
  container.appendChild(
    DOMSerializer.fromSchema(editor.schema).serializeFragment(
      Fragment.fromArray(editableContent),
    ),
  );

  return {
    editableHtml: container.innerHTML,
    inlineContentIds,
    mode: "rich",
    preservedBlockIds,
  };
}

function getRichEditorState(editor: Editor): EmailEditorState {
  const { inlineContentIds, preservedBlockIds } =
    inspectRichEditorDocument(editor);
  return {
    inlineContentIds,
    mode: "rich",
    preservedBlockIds,
  };
}

function inspectRichEditorDocument(editor: Editor) {
  const editableContent: Node[] = [];
  const inlineContentIds: string[] = [];
  const preservedBlockIds: string[] = [];

  editor.state.doc.forEach((node) => {
    if (node.type.name === "preservedEmailBlock") {
      if (node.attrs.id) preservedBlockIds.push(String(node.attrs.id));
      return;
    }

    editableContent.push(node);
    node.descendants((descendant) => {
      if (descendant.type.name === "emailImage" && descendant.attrs.contentId) {
        inlineContentIds.push(String(descendant.attrs.contentId));
      }
    });
  });

  return { editableContent, inlineContentIds, preservedBlockIds };
}

function setBlockDirection(editor: Editor, direction: "ltr" | "rtl") {
  for (const type of ["paragraph", "blockquote", "bulletList", "orderedList"]) {
    if (editor.isActive(type)) {
      editor.chain().focus().updateAttributes(type, { dir: direction }).run();
      return;
    }
  }
  editor
    .chain()
    .focus()
    .updateAttributes("paragraph", { dir: direction })
    .run();
}

function normalizeLinkHref(value: string) {
  const href = value.trim();
  if (!href) return "";
  if (/^(?:https?:\/\/|mailto:|tel:|#)/iu.test(href)) return href;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(href)) return `mailto:${href}`;
  return `https://${href}`;
}

function openSafeLink(value: string) {
  const href = normalizeLinkHref(value);
  if (!isSafeEmailUrl(href)) return;
  window.open(href, "_blank", "noopener,noreferrer");
}

function getActiveBlockDirection(editor: Editor) {
  for (const type of ["paragraph", "blockquote", "bulletList", "orderedList"]) {
    if (!editor.isActive(type)) continue;
    const direction = editor.getAttributes(type).dir;
    return direction === "ltr" || direction === "rtl" ? direction : undefined;
  }
}

function emptyEditorValue(
  mode: EmailEditorValue["mode"],
  editableHtml: string,
): EmailEditorValue {
  return {
    editableHtml,
    inlineContentIds: [],
    mode,
    preservedBlockIds: [],
  };
}
