"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useCallback, forwardRef, useImperativeHandle, useEffect } from "react";
import { cn } from "@/utils";
import { EnterHandler } from "@/components/editor/extensions";

export type TiptapHandle = {
  appendContent: (content: string) => void;
  getMarkdown: () => string | null;
  setMarkdown: (content: string) => void;
};

export const Tiptap = forwardRef<
  TiptapHandle,
  {
    initialContent?: string;
    onChange?: (html: string) => void;
    className?: string;
    autofocus?: boolean;
    onMoreClick?: () => void;
  }
>(function Tiptap(
  { initialContent = "", onChange, className, autofocus = true, onMoreClick },
  ref,
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Configure lists to preserve formatting
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
          HTMLAttributes: {
            class: "list-disc pl-5 mb-3",
          },
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
          HTMLAttributes: {
            class: "list-decimal pl-5 mb-3",
          },
        },
        // Configure paragraph to handle line breaks better
        paragraph: {
          HTMLAttributes: {
            class: "mb-3",
          },
        },
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
          HTMLAttributes: {
            class: "font-semibold mb-3",
          },
        },
        // Enable hard breaks with Shift+Enter or double space
        hardBreak: {
          keepMarks: true,
        },
        codeBlock: {
          HTMLAttributes: {
            class: "bg-muted p-3 rounded-md font-mono text-sm mb-3",
          },
        },
        blockquote: {
          HTMLAttributes: {
            class: "border-l-4 border-muted pl-4 italic mb-3",
          },
        },
      }),
      EnterHandler,
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
        breaks: true,
      }),
    ],
    content: "",
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
          "[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6",
          "[&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:mt-5",
          "[&_h3]:text-xl [&_h3]:font-bold [&_h3]:mb-3 [&_h3]:mt-4",
          "[&_h4]:text-lg [&_h4]:font-semibold [&_h4]:mb-2 [&_h4]:mt-3",
          "[&_h5]:text-base [&_h5]:font-semibold [&_h5]:mb-2 [&_h5]:mt-3",
          "[&_h6]:text-sm [&_h6]:font-semibold [&_h6]:mb-2 [&_h6]:mt-3",
          "[&_p]:leading-relaxed",
          "[&_ul]:my-3 [&_ol]:my-3",
          "[&_li]:mb-1",
          "[&_pre]:overflow-x-auto",
          "[&_hr]:my-4",
          className,
        ),
      },
    },
  });

  // Set initial markdown content after editor is ready
  useEffect(() => {
    if (editor && initialContent && !editor.isEmpty) {
      return;
    }
    
    if (editor && initialContent) {
      // Convert markdown to editor content
      editor.commands.setContent(
        editor.storage.markdown.parse(initialContent)
      );
    }
  }, [editor, initialContent]);

  useImperativeHandle(ref, () => ({
    appendContent: (content: string) => {
      if (!editor) return;

      // Parse markdown content before appending
      const parsedContent = editor.storage.markdown.parse(content);
      
      // Get the document end position
      const endPosition = editor.state.doc.content.size;

      // Insert parsed content at the end
      editor.commands.insertContentAt(endPosition, parsedContent);
    },
    getMarkdown: () => {
      if (!editor) return null;
      return editor.storage.markdown.getMarkdown();
    },
    setMarkdown: (content: string) => {
      if (!editor) return;

      // Convert markdown to editor content
      editor.commands.setContent(
        editor.storage.markdown.parse(content)
      );
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
