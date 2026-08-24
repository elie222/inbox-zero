"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useCallback, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/utils";
import { EnterHandler } from "@/components/editor/extensions";

export type TiptapHandle = {
  getMarkdown: () => string | null;
};

export const Tiptap = forwardRef<
  TiptapHandle,
  {
    initialContent?: string;
    onChange?: (content: string) => void;
    className?: string;
    autofocus?: boolean;
    onMoreClick?: () => void;
    preservePastedLineBreaks?: boolean;
    placeholder?: string;
    input?: "html" | "markdown";
    output?: "html" | "markdown";
  }
>(function Tiptap(
  {
    initialContent = "",
    onChange,
    className,
    autofocus = true,
    onMoreClick,
    preservePastedLineBreaks = false,
    placeholder,
    output = "html",
    input = output === "markdown" ? "markdown" : "html",
  },
  ref,
) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Configure lists to preserve formatting
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      EnterHandler,
      Markdown.configure({
        markedOptions: { breaks: preservePastedLineBreaks },
      }),
      Placeholder.configure({
        placeholder: placeholder || "",
        showOnlyWhenEditable: true,
      }),
    ],
    content: initialContent,
    contentType: input,
    onUpdate: useCallback(
      ({ editor }: { editor: Editor }) => {
        const content =
          output === "markdown" ? editor.getMarkdown() : editor.getHTML();
        onChange?.(content);
      },
      [onChange, output],
    ),
    autofocus,
    editorProps: {
      attributes: {
        class: cn(
          "px-3 py-2 max-w-none focus:outline-none min-h-[120px]",
          className,
        ),
        ...(placeholder && { "data-placeholder": placeholder }),
      },
    },
  });

  useImperativeHandle(ref, () => ({
    getMarkdown: () => {
      if (!editor) return null;
      return editor.getMarkdown();
    },
  }));

  return (
    <div className="relative w-full rounded-md border border-input bg-background pb-6">
      <EditorContent editor={editor} />
      {!!onMoreClick && (
        <div className="absolute bottom-2 left-0 flex">
          <button
            className="rounded-tr-md px-4 py-1 text-muted-foreground transition-transform hover:translate-x-1"
            type="button"
            onClick={onMoreClick}
          >
            ...
          </button>
        </div>
      )}
    </div>
  );
});
