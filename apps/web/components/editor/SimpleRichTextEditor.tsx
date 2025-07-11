"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useCallback, useEffect } from "react";
import { cn } from "@/utils";
import type { UseFormRegisterReturn } from "react-hook-form";
import type { FieldError } from "react-hook-form";

interface SimpleRichTextEditorProps {
  registerProps?: UseFormRegisterReturn;
  name?: string;
  error?: FieldError;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  defaultValue?: string;
  minHeight?: number;
}

export function SimpleRichTextEditor({
  registerProps,
  name,
  error,
  placeholder,
  className,
  disabled,
  defaultValue = "",
  minHeight = 300,
}: SimpleRichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Only include minimal features: bold, headings, lists
        italic: false,
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
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
      Markdown,
      ...(placeholder
        ? [
            Placeholder.configure({
              placeholder,
              showOnlyWhenEditable: true,
              showOnlyCurrent: false,
            }),
          ]
        : []),
    ],
    content: defaultValue || "",
    onUpdate: useCallback(
      ({ editor }: { editor: Editor }) => {
        const markdown = editor.storage.markdown.getMarkdown();
        // Update the hidden form field with markdown content
        if (registerProps?.onChange) {
          registerProps.onChange({
            target: { name: name || registerProps.name, value: markdown },
          });
        }
      },
      [registerProps, name],
    ),
    editorProps: {
      attributes: {
        class: cn(
          "px-3 py-2 max-w-none focus:outline-none prose prose-sm max-w-none",
          "prose-headings:font-cal prose-headings:text-foreground",
          "prose-p:text-foreground prose-li:text-foreground",
          "prose-strong:text-foreground prose-strong:font-semibold",
          "prose-ul:text-foreground prose-ol:text-foreground",
          "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          // Placeholder styles
          "[&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_p.is-editor-empty:first-child::before]:float-left",
          "[&_p.is-editor-empty:first-child::before]:text-muted-foreground",
          "[&_p.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_p.is-editor-empty:first-child::before]:h-0",
          disabled && "opacity-50 cursor-not-allowed",
        ),
        style: `min-height: ${minHeight}px`,
        ...(placeholder && { "data-placeholder": placeholder }),
      },
    },
    editable: !disabled,
  });

  // Update editor content when defaultValue changes
  useEffect(() => {
    if (
      editor &&
      (defaultValue || "") !== editor.storage.markdown.getMarkdown()
    ) {
      editor.commands.setContent(defaultValue || "");
    }
  }, [defaultValue, editor]);

  return (
    <div className={cn("relative w-full", className)}>
      <div
        className={cn(
          "min-h-[300px] rounded-md border border-input bg-background",
          "focus-within:border-ring focus-within:ring-1 focus-within:ring-ring",
          error &&
            "border-red-500 focus-within:border-red-500 focus-within:ring-red-500",
          disabled && "cursor-not-allowed opacity-50",
        )}
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
        {/* Hidden input for form registration */}
        <input
          type="hidden"
          {...registerProps}
          value={editor?.storage.markdown.getMarkdown() || ""}
        />
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error.message}</p>}
    </div>
  );
}
