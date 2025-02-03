"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback } from "react";
import { cn } from "@/utils";
import "@/styles/prosemirror.css";

export const Tiptap = ({
  initialContent = "",
  onChange,
  className,
}: {
  initialContent?: string;
  onChange?: (html: string) => void;
  className?: string;
  placeholder?: string;
}) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    onUpdate: useCallback(
      ({ editor }) => {
        const html = editor.getHTML();
        onChange?.(html);
      },
      [onChange],
    ),
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
};
