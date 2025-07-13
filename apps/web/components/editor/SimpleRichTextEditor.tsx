"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useEffect, useImperativeHandle, forwardRef } from "react";
import { cn } from "@/utils";
import { useLabels } from "@/hooks/useLabels";
import { createLabelMentionExtension } from "./extensions/LabelMention";
import "./SimpleRichTextEditor.css";

interface SimpleRichTextEditorProps {
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  defaultValue?: string;
  value?: string;
  minHeight?: number;
}

export interface SimpleRichTextEditorRef {
  appendText: (text: string) => void;
  getMarkdown: () => string;
}

export const SimpleRichTextEditor = forwardRef<
  SimpleRichTextEditorRef,
  SimpleRichTextEditorProps
>(
  (
    {
      placeholder,
      className,
      disabled,
      defaultValue = "",
      value,
      minHeight = 300,
    },
    ref,
  ) => {
    const { userLabels } = useLabels();

    const editor = useEditor(
      {
        extensions: [
          StarterKit.configure({
            italic: false,
            strike: false,
            code: {
              HTMLAttributes: {
                class: "simple-editor-highlight",
              },
            },
            codeBlock: false,
            blockquote: {},
            horizontalRule: false,
            dropcursor: false,
            gapcursor: false,
            bulletList: {
              keepMarks: true,
              keepAttributes: false,
            },
            orderedList: {
              keepMarks: true,
              keepAttributes: false,
            },
          }),
          ...(placeholder
            ? [
                Placeholder.configure({
                  placeholder,
                  showOnlyWhenEditable: true,
                  showOnlyCurrent: false,
                }),
              ]
            : []),
          Markdown.configure({
            html: false,
            transformPastedText: true,
            transformCopiedText: true,
            breaks: false,
            linkify: false,
            bulletListMarker: "*",
          }),
          ...(userLabels ? [createLabelMentionExtension(userLabels)] : []),
        ],
        content: defaultValue || "",
        editorProps: {
          attributes: {
            class: cn(
              "p-3 max-w-none focus:outline-none max-w-none simple-rich-editor",
              "prose prose-sm",
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
      },
      [userLabels],
    );

    // Expose editor methods via ref
    useImperativeHandle(
      ref,
      () => ({
        appendText: (text: string) => {
          if (editor) {
            const currentContent = editor.storage.markdown.getMarkdown();
            const newContent = currentContent
              ? `${currentContent}\n${text}`
              : text;
            editor.commands.setContent(newContent);
          }
        },
        getMarkdown: () => {
          return editor?.storage.markdown.getMarkdown() || "";
        },
      }),
      [editor],
    );

    return (
      <div className={cn("relative w-full", className)}>
        <div
          className={cn(
            "rounded-md border border-input bg-background",
            "focus-within:border-ring focus-within:ring-1 focus-within:ring-ring",
            disabled && "cursor-not-allowed opacity-50",
          )}
          style={{ minHeight }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  },
);
