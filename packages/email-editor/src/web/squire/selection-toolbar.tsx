import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type Squire from "squire-rte";
import styles from "../EmailEditor.module.css";
import { FormattingIcon, ToolbarButton } from "../toolbar";

export type FormatState = {
  blockquote: boolean;
  bold: boolean;
  bulletList: boolean;
  direction?: "ltr" | "rtl";
  italic: boolean;
  link: boolean;
  orderedList: boolean;
  strike: boolean;
  underline: boolean;
};

export const EMPTY_FORMAT_STATE: FormatState = {
  blockquote: false,
  bold: false,
  bulletList: false,
  italic: false,
  link: false,
  orderedList: false,
  strike: false,
  underline: false,
};

// Provider drafts use either tag for the same formatting.
const MARK_TAGS = {
  bold: ["B", "STRONG"],
  italic: ["I", "EM"],
  strike: ["S", "STRIKE", "DEL"],
  underline: ["U"],
} as const;

export function readFormatState(editor: Squire): FormatState {
  const root = editor.getRoot();
  const range = editor.getSelection();
  const closest = (selector: string) => {
    const node = range.startContainer;
    const element = node instanceof Element ? node : node.parentElement;
    const match = element?.closest(selector);
    return match && root.contains(match) && match !== root ? match : null;
  };
  const list = closest("ul, ol");
  const direction = closest("[dir]")?.getAttribute("dir");

  return {
    blockquote: Boolean(closest("blockquote")),
    bold: hasMark(editor, "bold"),
    bulletList: list?.nodeName === "UL",
    direction:
      direction === "ltr" || direction === "rtl" ? direction : undefined,
    italic: hasMark(editor, "italic"),
    link: editor.hasFormat("A"),
    orderedList: list?.nodeName === "OL",
    strike: hasMark(editor, "strike"),
    underline: hasMark(editor, "underline"),
  };
}

export function SelectionToolbar({
  editor,
  onLink,
  position,
  state,
}: {
  editor: Squire;
  onLink: () => void;
  // Viewport coordinates; the toolbar is portalled so containers that clip
  // their overflow cannot hide it.
  position: { centerX: number; top: number };
  state: FormatState;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    const width = ref.current?.offsetWidth ?? 0;
    const margin = 8;
    setLeft(
      Math.max(
        margin,
        Math.min(
          position.centerX - width / 2,
          window.innerWidth - width - margin,
        ),
      ),
    );
  }, [position.centerX]);

  return createPortal(
    <div
      className={styles.squireToolbar}
      ref={ref}
      style={{
        left: left ?? position.centerX,
        top: position.top,
        visibility: left === null ? "hidden" : undefined,
      }}
    >
      <div
        aria-label="Selection formatting"
        className={styles.bubbleToolbar}
        role="toolbar"
      >
        <ToolbarButton
          active={state.bold}
          label="Bold"
          onPress={() => toggleMark(editor, "bold")}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          active={state.italic}
          label="Italic"
          onPress={() => toggleMark(editor, "italic")}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          active={state.underline}
          label="Underline"
          onPress={() => toggleMark(editor, "underline")}
        >
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton
          active={state.strike}
          label="Strikethrough"
          onPress={() => toggleMark(editor, "strike")}
        >
          <s>S</s>
        </ToolbarButton>
        <ToolbarButton
          active={state.link}
          label="Add or edit link"
          onPress={onLink}
        >
          <FormattingIcon kind="link" />
        </ToolbarButton>
        <span aria-hidden className={styles.separator} />
        <ToolbarButton
          active={state.bulletList}
          label="Bulleted list"
          onPress={() =>
            state.bulletList ? editor.removeList() : editor.makeUnorderedList()
          }
        >
          <FormattingIcon kind="bullets" />
        </ToolbarButton>
        <ToolbarButton
          active={state.orderedList}
          label="Numbered list"
          onPress={() =>
            state.orderedList ? editor.removeList() : editor.makeOrderedList()
          }
        >
          <FormattingIcon kind="numbers" />
        </ToolbarButton>
        <ToolbarButton
          active={state.blockquote}
          label="Block quote"
          onPress={() =>
            state.blockquote
              ? editor.removeQuote()
              : editor.increaseQuoteLevel()
          }
        >
          <FormattingIcon kind="quote" />
        </ToolbarButton>
        <span aria-hidden className={styles.separator} />
        <ToolbarButton
          active={state.direction === "ltr"}
          label="Left-to-right text"
          onPress={() => editor.setTextDirection("ltr")}
        >
          <FormattingIcon kind="ltr" />
        </ToolbarButton>
        <ToolbarButton
          active={state.direction === "rtl"}
          label="Right-to-left text"
          onPress={() => editor.setTextDirection("rtl")}
        >
          <FormattingIcon kind="rtl" />
        </ToolbarButton>
      </div>
    </div>,
    document.body,
  );
}

function hasMark(editor: Squire, mark: keyof typeof MARK_TAGS) {
  return MARK_TAGS[mark].some((tag) => editor.hasFormat(tag));
}

function toggleMark(editor: Squire, mark: keyof typeof MARK_TAGS) {
  const [tag, ...alternates] = MARK_TAGS[mark];
  if (!hasMark(editor, mark)) {
    editor.changeFormat({ tag });
    return;
  }
  editor.changeFormat(null, { tag });
  for (const alternate of alternates) {
    if (editor.hasFormat(alternate))
      editor.changeFormat(null, { tag: alternate });
  }
}
