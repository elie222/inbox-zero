"use client";

import {
  type CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Squire from "squire-rte";
import type { EmailBodyMode } from "../../core/email-html";
import { SIGNATURE_CONTAINER_ATTRIBUTE } from "../../core/email-profile";
import type {
  EmailEditorHandle,
  EmailEditorSlashTrigger,
  EmailEditorState,
  EmailEditorValue,
} from "../EmailEditor";
import { LinkPanel, openSafeLink } from "../link-panel";
import {
  type ActivePreservedBlock,
  PreservedBlocksContext,
  PreservedBlocksToggle,
  QuotePreview,
  type RenderedPreservedEmailBlock,
} from "../preserved-block";
import {
  ORIGINAL_IMAGE_SOURCE_ATTRIBUTE,
  restoreOriginalImageSources,
  sanitizeEmailHtmlToFragment,
} from "../sanitize-dom";
import styles from "../EmailEditor.module.css";
import {
  EMPTY_FORMAT_STATE,
  type FormatState,
  readFormatState,
  SelectionToolbar,
} from "./selection-toolbar";
import { findSlashTrigger, type SlashTriggerMatch } from "./slash-trigger";

type SquireEmailEditorProps = {
  appearance: "contained" | "seamless";
  autofocus: boolean;
  initialHtml: string;
  initialMode: EmailBodyMode;
  placeholder: string;
  preservedBlocks: RenderedPreservedEmailBlock[];
  onImageFiles?: (files: File[]) => void;
  onSlashKeyDown?: (event: KeyboardEvent) => boolean;
  onSlashTrigger?: (trigger: EmailEditorSlashTrigger | null) => void;
  onStateChange?: (state: EmailEditorState) => void;
  resolveRemoteImages?: (
    sources: string[],
  ) => Promise<Record<string, string | null>>;
};

// Undo and redo replace the whole document, so the signature's collapsed or
// removed state has to be reconciled with the restored snapshot afterwards.
class EmailSquire extends Squire {
  isChangingHistory = false;
  onHistoryChange?: (direction: "undo" | "redo") => void;

  override undo() {
    return this.changeHistory("undo", () => super.undo());
  }

  override redo() {
    return this.changeHistory("redo", () => super.redo());
  }

  // Changes made through modifyDocument leave Squire in its "just undone"
  // state, where saving an undo step is skipped. Edits made outside typing
  // must still be undoable.
  saveEditUndoState() {
    this._isInUndoState = false;
    this.saveUndoState();
  }

  private changeHistory(direction: "undo" | "redo", change: () => Squire) {
    // Undo saves the current state before stepping back, and a collapsed
    // signature can make two snapshots render alike, so check both.
    const before = this.getRoot().innerHTML;
    const undoIndex = this._undoIndex;
    this.isChangingHistory = true;
    try {
      change();
      if (
        this.getRoot().innerHTML !== before ||
        this._undoIndex !== undoIndex
      ) {
        this.onHistoryChange?.(direction);
      }
    } finally {
      this.isChangingHistory = false;
    }
    return this;
  }
}

const MODIFIER_KEY =
  typeof navigator !== "undefined" &&
  /Mac OS X|iPhone|iPad/u.test(navigator.userAgent)
    ? "Meta-"
    : "Ctrl-";

export const SquireEmailEditor = forwardRef<
  EmailEditorHandle,
  SquireEmailEditorProps
>(function SquireEmailEditor(props, ref) {
  const { appearance, autofocus, initialHtml, initialMode, placeholder } =
    props;
  const propsRef = useRef(props);
  propsRef.current = props;

  const [{ quoteBlock, signatureHtml, preservedBlockIds }] = useState(() => ({
    quoteBlock: props.preservedBlocks.find((block) => block.kind === "quote"),
    signatureHtml: props.preservedBlocks.find(
      (block) => block.kind === "signature",
    )?.editableHtml,
    preservedBlockIds: props.preservedBlocks.map((block) => block.id),
  }));

  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EmailSquire | null>(null);
  const [editor, setEditor] = useState<EmailSquire | null>(null);

  // The signature element is detached from the editable root while collapsed,
  // so select-all, deletes and typing can never change it unseen.
  const signatureRef = useRef<HTMLElement | null>(null);
  const [signaturePresent, setSignaturePresentState] = useState(false);
  const signaturePresentRef = useRef(false);
  const [expanded, setExpandedState] = useState(false);
  const expandedRef = useRef(false);
  const [removeButtonTop, setRemoveButtonTop] = useState<number | null>(null);

  // An untouched draft is sent exactly as loaded; "dirty" means the content
  // differs from what was loaded, not merely that the DOM was touched.
  const dirtyRef = useRef(false);
  const baselineRef = useRef("");
  // Undo can bring back a deleted signature; redo has to delete it again.
  const restoredSignaturesRef = useRef(0);
  const focusedRef = useRef(false);
  const [formatState, setFormatState] =
    useState<FormatState>(EMPTY_FORMAT_STATE);
  const [toolbarPosition, setToolbarPosition] = useState<{
    bottom: number;
    centerX: number;
    top: number;
  } | null>(null);
  const [linkPanel, setLinkPanel] = useState<{
    href: string;
    key: number;
    range: Range;
  } | null>(null);

  const slashRef = useRef<SlashTriggerMatch | null>(null);
  const dismissedSlashRef = useRef<{ node: Node; offset: number } | null>(null);
  const imageSourcesRef = useRef(new Map<string, string | null>());

  const setSignaturePresent = useCallback((present: boolean) => {
    signaturePresentRef.current = present;
    setSignaturePresentState(present);
  }, []);

  // Cheap enough to run on every keystroke; the full HTML is only serialized
  // when the value is read.
  const readState = useCallback((): EmailEditorState => {
    const root = rootRef.current;
    const signature = signatureRef.current;
    const detachedSignature =
      signaturePresentRef.current && signature && !root?.contains(signature)
        ? signature
        : null;
    const inlineContentIds = [
      ...(root?.querySelectorAll("img[data-content-id]") ?? []),
      ...(detachedSignature?.querySelectorAll("img[data-content-id]") ?? []),
    ].map((image) => image.getAttribute("data-content-id") ?? "");

    if (!dirtyRef.current) {
      return { inlineContentIds, mode: initialMode, preservedBlockIds };
    }
    return {
      inlineContentIds,
      mode: "html",
      // An edited signature is part of the editable HTML from here on.
      preservedBlockIds: quoteBlock ? [quoteBlock.id] : [],
    };
  }, [initialMode, preservedBlockIds, quoteBlock]);

  const serializeContent = useCallback(() => {
    const template = document.createElement("template");
    template.innerHTML = editorRef.current?.getHTML() ?? "";
    const signature = signatureRef.current;
    if (
      signaturePresentRef.current &&
      signature &&
      !rootRef.current?.contains(signature)
    ) {
      template.content.append(signature.cloneNode(true));
    }
    return restoreOriginalImageSources(template.innerHTML);
  }, []);

  const markEdited = useCallback(() => {
    if (dirtyRef.current) return;
    dirtyRef.current = serializeContent() !== baselineRef.current;
  }, [serializeContent]);

  const readValue = useCallback((): EmailEditorValue => {
    const state = readState();
    return {
      ...state,
      editableHtml: dirtyRef.current ? serializeContent() : initialHtml,
    };
  }, [initialHtml, readState, serializeContent]);

  const emitState = useCallback(() => {
    propsRef.current.onStateChange?.(readState());
  }, [readState]);

  const updateSignatureControls = useCallback(() => {
    const signature = signatureRef.current;
    const root = rootRef.current;
    setRemoveButtonTop(
      signature && root?.contains(signature) ? signature.offsetTop : null,
    );
  }, []);

  const updateEmptyState = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const first = root.firstElementChild;
    const second = first?.nextElementSibling;
    const empty =
      Boolean(first) &&
      first !== signatureRef.current &&
      !first?.textContent?.trim() &&
      !first?.querySelector("img") &&
      (!second || second === signatureRef.current);
    // Squire observes its root, so state for styling lives on the wrapper.
    root.parentElement?.toggleAttribute("data-email-editor-empty", empty);
  }, []);

  const resolveImages = useCallback(() => {
    const currentEditor = editorRef.current;
    const root = rootRef.current;
    if (!currentEditor || !root) return;
    const cache = imageSourcesRef.current;
    const images = () => {
      const detached =
        signatureRef.current && !root.contains(signatureRef.current)
          ? [
              ...signatureRef.current.querySelectorAll<HTMLImageElement>(
                `img[${ORIGINAL_IMAGE_SOURCE_ATTRIBUTE}]:not([src])`,
              ),
            ]
          : [];
      return [
        ...root.querySelectorAll<HTMLImageElement>(
          `img[${ORIGINAL_IMAGE_SOURCE_ATTRIBUTE}]:not([src])`,
        ),
        ...detached,
      ];
    };
    const applyCached = () => {
      const updates = images().flatMap((image) => {
        const proxied = cache.get(
          image.getAttribute(ORIGINAL_IMAGE_SOURCE_ATTRIBUTE) ?? "",
        );
        return proxied ? [{ image, proxied }] : [];
      });
      if (!updates.length) return;
      currentEditor.modifyDocument(() => {
        for (const { image, proxied } of updates) {
          image.setAttribute("src", proxied);
        }
      });
      updateSignatureControls();
    };

    const resolver = propsRef.current.resolveRemoteImages;
    const pending = [
      ...new Set(
        images().map(
          (image) => image.getAttribute(ORIGINAL_IMAGE_SOURCE_ATTRIBUTE) ?? "",
        ),
      ),
    ].filter((source) => source && !cache.has(source));
    applyCached();
    if (!resolver || !pending.length) return;

    for (const source of pending) cache.set(source, null);
    resolver(pending)
      .then((resolved) => {
        for (const source of pending) {
          const proxied = resolved[source];
          if (proxied && /^(?:https?:|\/)/iu.test(proxied)) {
            cache.set(source, proxied);
          }
        }
        // A StrictMode remount replaces the editor while this is in flight.
        if (editorRef.current) resolveImagesRef.current();
      })
      .catch(() => {
        for (const source of pending) cache.delete(source);
      });
  }, [updateSignatureControls]);
  const resolveImagesRef = useRef(resolveImages);
  resolveImagesRef.current = resolveImages;

  const updateSlashTrigger = useCallback(() => {
    const currentEditor = editorRef.current;
    const onSlashTrigger = propsRef.current.onSlashTrigger;
    if (!currentEditor || !onSlashTrigger) return;
    let match = focusedRef.current
      ? findSlashTrigger(currentEditor.getSelection())
      : null;
    if (!match) dismissedSlashRef.current = null;
    const dismissed = dismissedSlashRef.current;
    if (
      match &&
      dismissed &&
      dismissed.node === match.range.startContainer &&
      dismissed.offset === match.range.startOffset
    ) {
      match = null;
    }
    if (!match && !slashRef.current) return;
    slashRef.current = match;
    onSlashTrigger(
      match
        ? { query: match.query, rect: match.range.getBoundingClientRect() }
        : null,
    );
  }, []);

  const closeSlashTrigger = useCallback(() => {
    if (!slashRef.current) return;
    slashRef.current = null;
    propsRef.current.onSlashTrigger?.(null);
  }, []);

  const updateSelectionUi = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    setFormatState(readFormatState(currentEditor));
    const range = currentEditor.getSelection();
    if (
      !focusedRef.current ||
      range.collapsed ||
      !range.toString().trim() ||
      !rootRef.current?.contains(range.commonAncestorContainer)
    ) {
      setToolbarPosition(null);
      return;
    }
    const selectionRect = range.getBoundingClientRect();
    setToolbarPosition({
      bottom: selectionRect.bottom,
      centerX: selectionRect.left + selectionRect.width / 2,
      top: selectionRect.top,
    });
  }, []);

  const openLinkPanel = useCallback(() => {
    const currentEditor = editorRef.current;
    const root = rootRef.current;
    if (!currentEditor || !root) return;
    const range = currentEditor.getSelection().cloneRange();
    const link = closestWithin(range.startContainer, "a", root);
    if (link) range.selectNodeContents(link);
    setToolbarPosition(null);
    setLinkPanel({
      href: link?.getAttribute("href") ?? "",
      key: Date.now(),
      range,
    });
  }, []);

  const setExpanded = useCallback((value: boolean) => {
    expandedRef.current = value;
    setExpandedState(value);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Squire is uncontrolled; it mounts once with the initial content.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const squire = new EmailSquire(root, {
      addLinks: true,
      blockTag: "DIV",
      sanitizeToDOMFragment: (html: string) =>
        sanitizeEmailHtmlToFragment(html),
      willCutCopy: restoreOriginalImageSources,
      tagAttributes: {
        a: { rel: "noopener noreferrer", target: "_blank" },
      },
    });
    editorRef.current = squire;

    squire.setKeyHandler(`${MODIFIER_KEY}d`, null);
    squire.setKeyHandler(`${MODIFIER_KEY}k`, (_editor, event) => {
      event.preventDefault();
      openLinkPanel();
    });

    // Loading body and signature together lets Squire normalise both into
    // valid blocks before the signature is detached. A restored draft already
    // carries its signature container.
    squire.setHTML(initialHtml);
    if (signatureHtml && !findSignature(root)) {
      squire.setHTML(`${initialHtml}${signatureHtml}`);
    }
    const signature = findSignature(root);
    signatureRef.current = signature;
    setSignaturePresent(Boolean(signature));
    if (signature) {
      squire.modifyDocument(() => {
        signature.remove();
        ensureBlock(squire, root);
      });
    }

    const reconcileSignature = (direction: "undo" | "redo") => {
      const found = findSignature(root);
      if (found) {
        if (!signaturePresentRef.current) restoredSignaturesRef.current += 1;
        signatureRef.current = found;
        setSignaturePresent(true);
        if (!expandedRef.current) {
          squire.modifyDocument(() => {
            found.remove();
            ensureBlock(squire, root);
          });
        }
        return;
      }
      if (!signaturePresentRef.current) return;
      if (direction === "redo" && restoredSignaturesRef.current > 0) {
        restoredSignaturesRef.current -= 1;
        setSignaturePresent(false);
        return;
      }
      // The snapshot was taken while the signature was collapsed.
      const restored = signatureRef.current;
      if (expandedRef.current && restored) {
        squire.modifyDocument(() => root.append(restored));
      }
    };

    const onInput = () => {
      if (!squire.isChangingHistory) {
        restoredSignaturesRef.current = 0;
        if (signaturePresentRef.current && expandedRef.current) {
          const found = findSignature(root);
          if (found) signatureRef.current = found;
          else setSignaturePresent(false);
        }
        markEdited();
      }
      updateEmptyState();
      updateSelectionUi();
      updateSlashTrigger();
      updateSignatureControls();
      resolveImages();
      emitState();
    };
    squire.onHistoryChange = (direction) => {
      reconcileSignature(direction);
      // Undoing every edit returns to the untouched draft.
      dirtyRef.current = serializeContent() !== baselineRef.current;
      onInput();
    };
    const onFocus = () => {
      focusedRef.current = true;
    };
    const onBlur = () => {
      focusedRef.current = false;
      setToolbarPosition(null);
      closeSlashTrigger();
    };
    const onCursor = () => {
      setToolbarPosition(null);
      setFormatState(readFormatState(squire));
      updateSlashTrigger();
    };
    squire.addEventListener("input", onInput);
    squire.addEventListener("focus", onFocus);
    squire.addEventListener("blur", onBlur);
    squire.addEventListener("select", updateSelectionUi);
    squire.addEventListener("cursor", onCursor);
    squire.addEventListener("pathChange", updateSelectionUi);
    squire.addEventListener("willPaste", (event: Event) => {
      // Only the composer creates signature containers; pasted ones would
      // otherwise hide under the collapsed signature toggle.
      const fragment = (event as CustomEvent<{ fragment: DocumentFragment }>)
        .detail.fragment;
      for (const element of fragment.querySelectorAll(
        `[${SIGNATURE_CONTAINER_ATTRIBUTE}]`,
      )) {
        element.removeAttribute(SIGNATURE_CONTAINER_ATTRIBUTE);
      }
    });

    const interceptImageFiles = (event: ClipboardEvent | DragEvent) => {
      const transfer =
        "clipboardData" in event ? event.clipboardData : event.dataTransfer;
      const files = Array.from(transfer?.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );
      const onImageFiles = propsRef.current.onImageFiles;
      if (!files.length || !onImageFiles) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onImageFiles(files);
    };
    const onClick = (event: MouseEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const link = (event.target as Element | null)?.closest?.("a");
      if (!link) return;
      event.preventDefault();
      openSafeLink(link.getAttribute("href") ?? "");
    };
    root.addEventListener("paste", interceptImageFiles, true);
    root.addEventListener("drop", interceptImageFiles, true);
    root.addEventListener("click", onClick);

    // Window capture runs before Radix's document listener, so Escape closes
    // the snippet picker without closing the compose window.
    const onWindowKeyDown = (event: KeyboardEvent) => {
      const match = slashRef.current;
      if (!match || !(event.target instanceof Node)) return;
      if (!root.contains(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismissedSlashRef.current = {
          node: match.range.startContainer,
          offset: match.range.startOffset,
        };
        closeSlashTrigger();
        return;
      }
      if (propsRef.current.onSlashKeyDown?.(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onWindowKeyDown, true);

    baselineRef.current = serializeContent();
    updateEmptyState();
    resolveImages();
    if (autofocus) {
      squire.focus();
      squire.moveCursorToEnd();
    }
    setEditor(squire);
    emitState();

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown, true);
      root.removeEventListener("paste", interceptImageFiles, true);
      root.removeEventListener("drop", interceptImageFiles, true);
      root.removeEventListener("click", onClick);
      squire.destroy();
      editorRef.current = null;
      setEditor(null);
    };
  }, []);

  // Show or hide the signature to match the toggle.
  useEffect(() => {
    const root = rootRef.current;
    const signature = signatureRef.current;
    if (!editor || !root || !signature) return;
    const visible = signaturePresent && expanded;
    const inRoot = root.contains(signature);
    if (visible && !inRoot) {
      editor.modifyDocument(() => root.append(signature));
    } else if (!visible && inRoot) {
      const selectionInSignature = signature.contains(
        editor.getSelection().startContainer,
      );
      editor.modifyDocument(() => {
        signature.remove();
        ensureBlock(editor, root);
      });
      if (selectionInSignature) editor.moveCursorToEnd();
    }
    updateEmptyState();
    updateSignatureControls();
  }, [
    editor,
    expanded,
    signaturePresent,
    updateEmptyState,
    updateSignatureControls,
  ]);

  const removeSignature = useCallback(() => {
    const root = rootRef.current;
    const signature = signatureRef.current;
    if (!editor || !root || !signature) return;
    editor.saveEditUndoState();
    editor.modifyDocument(() => {
      signature.remove();
      ensureBlock(editor, root);
    });
    dirtyRef.current = true;
    setSignaturePresent(false);
    updateSignatureControls();
    emitState();
  }, [editor, emitState, setSignaturePresent, updateSignatureControls]);

  const activeBlocks = useMemo(() => {
    const blocks: ActivePreservedBlock[] = [];
    if (signaturePresent) blocks.push({ id: "signature", kind: "signature" });
    if (quoteBlock) blocks.push({ id: quoteBlock.id, kind: "quote" });
    return blocks;
  }, [quoteBlock, signaturePresent]);
  const preservedBlocksState = useMemo(
    () => ({
      blocks: activeBlocks,
      expanded,
      toggle: () => setExpanded(!expandedRef.current),
    }),
    [activeBlocks, expanded, setExpanded],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        editorRef.current?.focus();
      },
      getSelectedText: () => editorRef.current?.getSelectedText() ?? "",
      getValue: readValue,
      insertHtml: (html) => {
        const currentEditor = editorRef.current;
        if (!currentEditor || !html) return false;
        currentEditor.focus();
        currentEditor.insertHTML(html);
        dirtyRef.current = true;
        return true;
      },
      insertText: (text) => {
        const currentEditor = editorRef.current;
        if (!currentEditor || !text) return false;
        currentEditor.focus();
        currentEditor.insertPlainText(text, false);
        dirtyRef.current = true;
        return true;
      },
      insertInlineImage: ({ alt, contentId, previewUrl }) => {
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;
        currentEditor.focus();
        currentEditor.insertImage(previewUrl, {
          alt,
          "data-content-id": contentId,
          title: alt,
        });
        dirtyRef.current = true;
        return true;
      },
      removeInlineImage: (contentId) => {
        const currentEditor = editorRef.current;
        const root = rootRef.current;
        if (!currentEditor || !root) return false;
        const images = [
          ...root.querySelectorAll("img[data-content-id]"),
          ...(signatureRef.current?.querySelectorAll("img[data-content-id]") ??
            []),
        ].filter(
          (image) => image.getAttribute("data-content-id") === contentId,
        );
        if (!images.length) return false;
        currentEditor.saveEditUndoState();
        currentEditor.modifyDocument(() => {
          for (const image of images) image.remove();
        });
        dirtyRef.current = true;
        emitState();
        return true;
      },
      replaceSlashTrigger: (html) => {
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;
        const match =
          slashRef.current ?? findSlashTrigger(currentEditor.getSelection());
        if (!match) return false;
        currentEditor.focus();
        currentEditor.setSelection(match.range);
        dirtyRef.current = true;
        if (html) {
          currentEditor.insertHTML(html);
        } else {
          currentEditor.saveEditUndoState();
          currentEditor.modifyDocument(() => match.range.deleteContents());
          currentEditor.setSelection(match.range);
          emitState();
        }
        closeSlashTrigger();
        return true;
      },
    }),
    [closeSlashTrigger, emitState, readValue],
  );

  return (
    <PreservedBlocksContext.Provider value={preservedBlocksState}>
      <div
        className={styles.surface}
        data-email-editor-root
        data-email-editor-appearance={appearance}
        data-email-editor-engine="squire"
        data-email-editor-mode="rich"
      >
        <div
          className={styles.editor}
          onScroll={() => {
            setToolbarPosition(null);
            updateSlashTrigger();
          }}
        >
          <div className={styles.squireBody}>
            <div
              aria-label="Email message"
              aria-multiline="true"
              className={styles.squireContent}
              data-email-editor-content=""
              dir="auto"
              ref={rootRef}
              role="textbox"
              style={
                {
                  "--email-editor-placeholder": JSON.stringify(placeholder),
                } as CSSProperties
              }
              tabIndex={0}
            />
            {removeButtonTop !== null && (
              <button
                aria-label="Remove signature"
                className={styles.squireRemoveSignature}
                onClick={removeSignature}
                onMouseDown={(event) => event.preventDefault()}
                style={{ top: removeButtonTop }}
                type="button"
              >
                ×
              </button>
            )}
            {activeBlocks.length > 0 && (
              <div className={styles.squirePreserved}>
                <PreservedBlocksToggle />
                {quoteBlock && (
                  <div data-email-preserved-kind="quote">
                    {expanded && (
                      <QuotePreview previewHtml={quoteBlock.previewHtml} />
                    )}
                  </div>
                )}
              </div>
            )}
            <div
              aria-hidden="true"
              className={styles.squireFiller}
              onMouseDown={(event) => {
                if (event.button !== 0 || !editor) return;
                event.preventDefault();
                editor.focus();
                editor.moveCursorToEnd();
              }}
            />
          </div>
        </div>

        {editor && toolbarPosition && (
          <SelectionToolbar
            editor={editor}
            onLink={openLinkPanel}
            position={toolbarPosition}
            state={formatState}
          />
        )}

        {editor && linkPanel && (
          <LinkPanel
            initialHref={linkPanel.href}
            key={linkPanel.key}
            onApply={(href) => {
              editor.focus();
              editor.setSelection(linkPanel.range);
              if (linkPanel.range.collapsed) {
                editor.insertHTML(
                  `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`,
                );
              } else {
                editor.makeLink(href, {
                  rel: "noopener noreferrer",
                  target: "_blank",
                });
              }
              setLinkPanel(null);
            }}
            onCancel={() => {
              setLinkPanel(null);
              editor.focus();
              editor.setSelection(linkPanel.range);
            }}
            onRemove={() => {
              editor.focus();
              editor.setSelection(linkPanel.range);
              editor.removeLink();
              setLinkPanel(null);
            }}
          />
        )}
      </div>
    </PreservedBlocksContext.Provider>
  );
});

function findSignature(root: HTMLElement) {
  const containers = root.querySelectorAll<HTMLElement>(
    `[${SIGNATURE_CONTAINER_ATTRIBUTE}]`,
  );
  return containers.item(containers.length - 1) ?? null;
}

// Squire needs at least one block to place the caret in.
function ensureBlock(editor: Squire, root: HTMLElement) {
  if (!root.firstElementChild) root.append(editor.createDefaultBlock());
}

function closestWithin(node: Node, selector: string, root: HTMLElement) {
  const element = node instanceof Element ? node : node.parentElement;
  const match = element?.closest(selector);
  return match && root.contains(match) ? match : null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}
