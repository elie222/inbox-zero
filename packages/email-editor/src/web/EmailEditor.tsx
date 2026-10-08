"use client";

import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AnyExtension } from "@tiptap/core";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { BubbleMenu } from "@tiptap/react/menus";
import { DOMSerializer, Fragment, type Node } from "@tiptap/pm/model";
import { prepareEmailBodySignatureHtml } from "../core/email-body";
import {
  type EmailBodyMode,
  prepareEditableSignatureHtml,
  sanitizePreservedEmailHtmlForPreview,
} from "../core/email-html";
import { createEmailEditorExtensions } from "./email-extensions";
import { LinkPanel, openSafeLink } from "./link-panel";
import { FormattingIcon, ToolbarButton } from "./toolbar";
import {
  type ActivePreservedBlock,
  PreservedBlocksContext,
  PreservedBlockView,
  type RenderedPreservedEmailBlock,
} from "./preserved-block";
import styles from "./EmailEditor.module.css";

// Squire touches the DOM when its module loads, and Tiptap-only consumers
// should not download it.
const SquireEmailEditor = lazy(() =>
  import("./squire/SquireEmailEditor").then((module) => ({
    default: module.SquireEmailEditor,
  })),
);

export type EmailEditorValue = {
  editableHtml: string;
  inlineContentIds: string[];
  mode: EmailBodyMode;
  preservedBlockIds: string[];
};

export type EmailEditorState = Omit<EmailEditorValue, "editableHtml">;

export type EmailEditorPreservedBlock = {
  id: string;
  kind: "quote" | "signature";
  html: string;
};

export type EmailEditorSlashTrigger = {
  query: string;
  rect: DOMRect;
};

export type EmailEditorHandle = {
  focus: () => void;
  getSelectedText: () => string;
  getValue: () => EmailEditorValue;
  insertHtml: (html: string, range?: { from: number; to: number }) => boolean;
  insertText: (text: string) => boolean;
  insertInlineImage: (image: {
    alt: string;
    contentId: string;
    previewUrl: string;
  }) => boolean;
  removeInlineImage: (contentId: string) => boolean;
  // Replaces the "/query" reported by onSlashTrigger. Squire engine only.
  replaceSlashTrigger: (html: string) => boolean;
};

export type EmailEditorProps = {
  appearance?: "contained" | "seamless";
  engine?: "tiptap" | "squire";
  // Tiptap engine only.
  extraExtensions?: AnyExtension[];
  initialHtml: string;
  mode?: EmailBodyMode;
  preservedBlocks?: EmailEditorPreservedBlock[];
  unsupported?: string[];
  placeholder?: string;
  autofocus?: boolean;
  onStateChange?: (state: EmailEditorState) => void;
  onImageFiles?: (files: File[]) => void;
  // Squire engine only: a "/" typed at a line start or after whitespace.
  onSlashTrigger?: (trigger: EmailEditorSlashTrigger | null) => void;
  // Squire engine only: keys typed while a slash trigger is open. Return true
  // when handled.
  onSlashKeyDown?: (event: KeyboardEvent) => boolean;
  // Squire engine only: maps remote image URLs to proxied URLs for display.
  // Images without a mapping show their alt text; sent HTML keeps the original.
  resolveRemoteImages?: (
    sources: string[],
  ) => Promise<Record<string, string | null>>;
};

export const EmailEditor = forwardRef<EmailEditorHandle, EmailEditorProps>(
  function EmailEditor(
    {
      appearance = "contained",
      engine = "tiptap",
      initialHtml,
      mode = "rich",
      preservedBlocks = [],
      unsupported = [],
      placeholder = "Write a message…",
      autofocus = true,
      extraExtensions = [],
      onStateChange,
      onImageFiles,
      onSlashKeyDown,
      onSlashTrigger,
      resolveRemoteImages,
    },
    ref,
  ) {
    const [initialState] = useState(() => ({
      engine,
      initialHtml,
      appearance,
      mode,
      placeholder,
      autofocus,
      extraExtensions,
      preservedBlocks: preservedBlocks.map((block) => ({
        id: block.id,
        kind: block.kind,
        previewHtml: sanitizePreservedEmailHtmlForPreview(block.html),
        editableHtml:
          block.kind === "signature"
            ? ((engine === "squire"
                ? prepareEmailBodySignatureHtml(block.html)
                : prepareEditableSignatureHtml(block.html)) ?? undefined)
            : undefined,
      })),
      unsupported,
    }));

    if (initialState.engine === "squire") {
      return (
        <Suspense
          fallback={<div className={styles.surface} aria-busy="true" />}
        >
          <SquireEmailEditor
            ref={ref}
            appearance={initialState.appearance}
            autofocus={initialState.autofocus}
            initialHtml={initialState.initialHtml}
            initialMode={initialState.mode}
            onImageFiles={onImageFiles}
            onSlashKeyDown={onSlashKeyDown}
            onSlashTrigger={onSlashTrigger}
            onStateChange={onStateChange}
            placeholder={initialState.placeholder}
            preservedBlocks={initialState.preservedBlocks}
            resolveRemoteImages={resolveRemoteImages}
          />
        </Suspense>
      );
    }

    // Tiptap's schema would drop the layout of HTML-profile drafts.
    if (initialState.mode === "fallback" || initialState.mode === "html") {
      return (
        <FallbackEmailEditor
          ref={ref}
          appearance={initialState.appearance}
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
        appearance={initialState.appearance}
        autofocus={initialState.autofocus}
        initialHtml={initialState.initialHtml}
        onStateChange={onStateChange}
        onImageFiles={onImageFiles}
        extraExtensions={initialState.extraExtensions}
        placeholder={initialState.placeholder}
        preservedBlocks={initialState.preservedBlocks}
      />
    );
  },
);

const RichEmailEditor = forwardRef<
  EmailEditorHandle,
  Required<
    Pick<
      EmailEditorProps,
      "appearance" | "autofocus" | "initialHtml" | "placeholder"
    >
  > &
    Pick<EmailEditorProps, "onStateChange" | "onImageFiles"> & {
      extraExtensions: AnyExtension[];
      preservedBlocks: RenderedPreservedEmailBlock[];
    }
>(function RichEmailEditor(
  {
    appearance,
    autofocus,
    extraExtensions,
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

  const [expanded, setExpanded] = useState(false);
  const [activeBlocks, setActiveBlocks] = useState<ActivePreservedBlock[]>(() =>
    preservedBlocks.map(({ id, kind }) => ({ id, kind })),
  );
  const preservedBlocksState = useMemo(
    () => ({
      blocks: activeBlocks,
      expanded,
      toggle: () => setExpanded((value) => !value),
    }),
    [activeBlocks, expanded],
  );

  const emitChange = useCallback((editor: Editor) => {
    const {
      inlineContentIds,
      preservedBlocks: blocks,
      preservedBlockIds,
    } = inspectRichEditorDocument(editor);
    setActiveBlocks((current) =>
      hasSamePreservedBlocks(current, blocks) ? current : blocks,
    );
    onStateChangeRef.current?.({
      inlineContentIds,
      mode: "rich",
      preservedBlockIds,
    });
  }, []);

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions: createEmailEditorExtensions(placeholder, extraExtensions),
      content: initialHtml,
      editorProps: {
        attributes: {
          "aria-label": "Email message",
          "aria-multiline": "true",
          "data-email-editor-content": "",
          dir: "auto",
          role: "textbox",
        },
        handleDOMEvents: {
          mousedown: (view, event) => {
            const target = event.target;
            if (
              !(target instanceof Element) ||
              event.button !== 0 ||
              target.closest("button") ||
              target.closest("[data-email-signature-content]")
            ) {
              return false;
            }
            let preservedBlock = target.closest("[data-email-preserved-kind]");
            const lastEditorChild = view.dom.lastElementChild;
            if (
              !preservedBlock &&
              lastEditorChild?.matches("[data-email-preserved-kind]") &&
              event.clientY > lastEditorChild.getBoundingClientRect().bottom
            ) {
              preservedBlock = lastEditorChild;
            }
            if (!preservedBlock) return false;

            event.preventDefault();
            const blockPosition = view.posAtDOM(preservedBlock, 0);
            const selection = TextSelection.near(
              view.state.doc.resolve(blockPosition),
              -1,
            );
            view.dispatch(view.state.tr.setSelection(selection));
            view.focus();
            return true;
          },
        },
        // Only the composer creates signature containers; pasted ones would
        // otherwise hide under the collapsed signature toggle.
        transformPastedHTML: (html) => {
          const document = new DOMParser().parseFromString(html, "text/html");
          for (const element of document.querySelectorAll("[data-smartmail]")) {
            element.removeAttribute("data-smartmail");
          }
          return document.body.innerHTML;
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
        for (const { editableHtml, ...block } of preservedBlocks) {
          const end = createdEditor.state.doc.content.size;
          if (!editableHtml) {
            createdEditor.commands.insertContentAt(
              end,
              { type: "preservedEmailBlock", attrs: block },
              { updateSelection: false },
            );
            continue;
          }
          createdEditor.commands.insertContentAt(end, editableHtml, {
            updateSelection: false,
          });
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
  }, [editor]);

  const closeLinkPanel = useCallback(() => {
    setLinkPanel(null);
    editor?.commands.focus();
  }, [editor]);

  const applyLink = useCallback(
    (href: string) => {
      if (!editor || !linkPanel) return;
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
    },
    [editor, linkPanel],
  );

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
      getSelectedText: () => {
        if (!editor) return "";
        const { from, to } = editor.state.selection;
        return editor.state.doc.textBetween(from, to, "\n");
      },
      getValue: () =>
        editor
          ? getRichEditorValue(editor)
          : emptyEditorValue("rich", initialHtml),
      insertHtml: (html, range) => {
        if (!editor) return false;
        const chain = editor.chain().focus();
        if (range) chain.deleteRange(range);
        if (html) chain.insertContent(html);
        return chain.run();
      },
      insertText: (text: string) => {
        if (!editor || !text) return false;
        return editor
          .chain()
          .focus()
          .command(({ dispatch, tr }) => {
            if (dispatch) tr.insertText(text);
            return true;
          })
          .run();
      },
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
      replaceSlashTrigger: () => false,
    }),
    [editor, initialHtml],
  );

  if (!editor) return <div className={styles.surface} aria-busy="true" />;

  return (
    <PreservedBlocksContext.Provider value={preservedBlocksState}>
      <div
        className={styles.surface}
        data-email-editor-root
        data-email-editor-appearance={appearance}
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
          options={{ offset: 8, placement: "bottom" }}
          shouldShow={({ state, from, to }) =>
            editor.isFocused &&
            state.selection instanceof TextSelection &&
            from !== to &&
            Boolean(state.doc.textBetween(from, to).trim())
          }
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
            <span aria-hidden className={styles.separator} />
            <ToolbarButton
              active={toolbarState?.bulletList}
              label="Bulleted list"
              onPress={() => editor.chain().focus().toggleBulletList().run()}
            >
              <FormattingIcon kind="bullets" />
            </ToolbarButton>
            <ToolbarButton
              active={toolbarState?.orderedList}
              label="Numbered list"
              onPress={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <FormattingIcon kind="numbers" />
            </ToolbarButton>
            <ToolbarButton
              active={toolbarState?.blockquote}
              label="Block quote"
              onPress={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <FormattingIcon kind="quote" />
            </ToolbarButton>
            <span aria-hidden className={styles.separator} />
            <ToolbarButton
              active={toolbarState?.direction === "ltr"}
              label="Left-to-right text"
              onPress={() => setBlockDirection(editor, "ltr")}
            >
              <FormattingIcon kind="ltr" />
            </ToolbarButton>
            <ToolbarButton
              active={toolbarState?.direction === "rtl"}
              label="Right-to-left text"
              onPress={() => setBlockDirection(editor, "rtl")}
            >
              <FormattingIcon kind="rtl" />
            </ToolbarButton>
          </div>
        </BubbleMenu>

        {linkPanel && (
          <LinkPanel
            initialHref={linkPanel.href}
            key={`${linkPanel.from}-${linkPanel.to}`}
            onApply={applyLink}
            onCancel={closeLinkPanel}
            onRemove={removeLink}
          />
        )}
      </div>
    </PreservedBlocksContext.Provider>
  );
});

const FallbackEmailEditor = forwardRef<
  EmailEditorHandle,
  Pick<
    EmailEditorProps,
    "appearance" | "autofocus" | "initialHtml" | "onStateChange" | "unsupported"
  > & {
    preservedBlocks: RenderedPreservedEmailBlock[];
  }
>(function FallbackEmailEditor(
  {
    appearance,
    autofocus,
    initialHtml,
    onStateChange,
    preservedBlocks,
    unsupported = [],
  },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeBlocks, setActiveBlocks] = useState(preservedBlocks);
  const [expanded, setExpanded] = useState(false);
  const preservedBlocksState = useMemo(
    () => ({
      blocks: activeBlocks.map(({ id, kind }) => ({ id, kind })),
      expanded,
      toggle: () => setExpanded((value) => !value),
    }),
    [activeBlocks, expanded],
  );
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
      getSelectedText: () => {
        const selection = window.getSelection();
        if (!selection || !editorRef.current?.contains(selection.anchorNode)) {
          return "";
        }
        return selection.toString();
      },
      getValue,
      insertHtml: (html, _range) => {
        const editorElement = editorRef.current;
        if (!editorElement || !html) return false;
        editorElement.focus();
        const inserted = document.execCommand("insertHTML", false, html);
        currentHtmlRef.current = editorElement.innerHTML;
        return inserted;
      },
      insertText: (text: string) => {
        const editorElement = editorRef.current;
        if (!editorElement || !text) return false;
        editorElement.focus();
        const inserted = document.execCommand("insertText", false, text);
        currentHtmlRef.current = editorElement.innerHTML;
        return inserted;
      },
      insertInlineImage: () => false,
      removeInlineImage: () => false,
      replaceSlashTrigger: () => false,
    }),
    [getValue],
  );

  return (
    <PreservedBlocksContext.Provider value={preservedBlocksState}>
      <div
        className={styles.surface}
        data-email-editor-root
        data-email-editor-appearance={appearance}
        data-email-editor-mode="fallback"
      >
        <p className={styles.fallbackWarning} role="status">
          This draft contains provider formatting that rich editing cannot
          safely represent ({unsupported.join(", ")}). Sending it unchanged
          preserves the original HTML; editing may simplify unsupported
          formatting.
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
    </PreservedBlocksContext.Provider>
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
        <FormattingIcon kind="link" />
      </ToolbarButton>
    </>
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
      <PreservedBlockView block={block} onRemove={onRemove} />
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

function inspectRichEditorDocument(editor: Editor) {
  const editableContent: Node[] = [];
  const inlineContentIds: string[] = [];
  const preservedBlocks: ActivePreservedBlock[] = [];
  // Only protected blocks are re-attached when sending; an editable signature
  // is already part of the editable HTML.
  const preservedBlockIds: string[] = [];

  editor.state.doc.forEach((node) => {
    if (node.type.name === "preservedEmailBlock") {
      if (node.attrs.id) {
        preservedBlocks.push({
          id: String(node.attrs.id),
          kind: node.attrs.kind === "signature" ? "signature" : "quote",
        });
        preservedBlockIds.push(String(node.attrs.id));
      }
      return;
    }
    if (node.type.name === "editableEmailSignature") {
      preservedBlocks.push({ id: "signature", kind: "signature" });
    }

    editableContent.push(node);
    node.descendants((descendant) => {
      if (descendant.type.name === "emailImage" && descendant.attrs.contentId) {
        inlineContentIds.push(String(descendant.attrs.contentId));
      }
    });
  });

  return {
    editableContent,
    inlineContentIds,
    preservedBlocks,
    preservedBlockIds,
  };
}

function hasSamePreservedBlocks(
  current: ActivePreservedBlock[],
  next: ActivePreservedBlock[],
) {
  return (
    current.length === next.length &&
    current.every(
      (block, index) =>
        block.id === next[index].id && block.kind === next[index].kind,
    )
  );
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
