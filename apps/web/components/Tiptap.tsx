"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback } from "react";
import { cn } from "@/utils";
import "@/styles/prosemirror.css";

export function Tiptap({
  initialContent = "",
  onChange,
  className,
  autofocus = true,
}: {
  initialContent?: string;
  onChange?: (html: string) => void;
  className?: string;
  autofocus?: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit as any],
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
          "prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[150px] px-3 py-2",
          className,
        ),
      },
    },
  });

  return (
    <div className="w-full rounded-md border border-input bg-background">
      <EditorContent editor={editor} />
    </div>
  );
}
