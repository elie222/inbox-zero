"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useCallback, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/utils";
import { EnterHandler } from "@/components/editor/extensions";

export type TiptapHandle = {
  appendContent: (content: string) => void;
  getMarkdown: () => string | null;
};

export const Tiptap = forwardRef<
  TiptapHandle,
  {
    initialContent?: string;
    onChange?: (html: string) => void;
    className?: string;
    autofocus?: boolean;
    onMoreClick?: () => void;
    preservePastedLineBreaks?: boolean;
  }
>(function Tiptap(
  {
    initialContent = "",
    onChange,
    className,
    autofocus = true,
    onMoreClick,
    preservePastedLineBreaks = false,
  },
  ref,
) {
  const editor = useEditor({
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
      preservePastedLineBreaks
        ? Markdown.configure({
            html: false,
            transformPastedText: true,
            transformCopiedText: true,
            breaks: true,
            linkify: false,
            bulletListMarker: "-",
          })
        : Markdown,
    ],
    content: initialContent,
    onUpdate: useCallback(
      ({ editor }: { editor: Editor }) => {
        const html = editor.getHTML();
        onChange?.(html);
      },
      [onChange],
    ),
    autofocus,
    editorProps: {
      attributes: {
        class: cn(
          "px-3 py-2 max-w-none focus:outline-none min-h-[120px]",
          className,
        ),
      },
    },
  });

  useImperativeHandle(ref, () => ({
    appendContent: (content: string) => {
      if (!editor) return;

      // Get the document end position
      const endPosition = editor.state.doc.content.size;

      // Insert content at the end
      editor.commands.insertContentAt(endPosition, content);
    },
    getMarkdown: () => {
      if (!editor) return null;
      return editor.storage.markdown.getMarkdown();
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
