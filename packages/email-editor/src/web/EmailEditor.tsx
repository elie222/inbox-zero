"use client";

import { forwardRef, lazy, Suspense, useState } from "react";
import { prepareEmailBodySignatureHtml } from "../core/email-body";
import {
  type EmailBodyMode,
  sanitizePreservedEmailHtmlForPreview,
} from "../core/email-html";
import styles from "./EmailEditor.module.css";

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
  insertHtml: (html: string) => boolean;
  insertText: (text: string) => boolean;
  insertInlineImage: (image: {
    alt: string;
    contentId: string;
    previewUrl: string;
  }) => boolean;
  removeInlineImage: (contentId: string) => boolean;
  // Replaces the "/query" reported by onSlashTrigger.
  replaceSlashTrigger: (html: string) => boolean;
};

export type EmailEditorProps = {
  appearance?: "contained" | "seamless";
  initialHtml: string;
  mode?: EmailBodyMode;
  preservedBlocks?: EmailEditorPreservedBlock[];
  placeholder?: string;
  autofocus?: boolean;
  onStateChange?: (state: EmailEditorState) => void;
  onImageFiles?: (files: File[]) => void;
  // A "/" typed at a line start or after whitespace.
  onSlashTrigger?: (trigger: EmailEditorSlashTrigger | null) => void;
  // Keys typed while a slash trigger is open. Return true when handled.
  onSlashKeyDown?: (event: KeyboardEvent) => boolean;
  // Maps remote image URLs to proxied URLs for display. Images without a
  // mapping show their alt text; sent HTML keeps the original addresses.
  resolveRemoteImages?: (
    sources: string[],
  ) => Promise<Record<string, string | null>>;
};

// Squire touches the DOM when its module loads, so it must stay out of
// server rendering.
const SquireEmailEditor = lazy(() =>
  import("./squire/SquireEmailEditor").then((module) => ({
    default: module.SquireEmailEditor,
  })),
);

export const EmailEditor = forwardRef<EmailEditorHandle, EmailEditorProps>(
  function EmailEditor(
    {
      appearance = "contained",
      initialHtml,
      mode = "original",
      preservedBlocks = [],
      placeholder = "Write a message…",
      autofocus = true,
      onStateChange,
      onImageFiles,
      onSlashKeyDown,
      onSlashTrigger,
      resolveRemoteImages,
    },
    ref,
  ) {
    const [initialState] = useState(() => ({
      initialHtml,
      appearance,
      mode,
      placeholder,
      autofocus,
      preservedBlocks: preservedBlocks.map((block) => ({
        id: block.id,
        kind: block.kind,
        previewHtml: sanitizePreservedEmailHtmlForPreview(block.html),
        editableHtml:
          block.kind === "signature"
            ? (prepareEmailBodySignatureHtml(block.html) ?? undefined)
            : undefined,
      })),
    }));

    return (
      <Suspense fallback={<div className={styles.surface} aria-busy="true" />}>
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
  },
);
