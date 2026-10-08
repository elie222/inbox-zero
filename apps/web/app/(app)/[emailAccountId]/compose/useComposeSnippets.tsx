"use client";

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { BracesIcon } from "lucide-react";
import type {
  EmailEditorHandle,
  EmailEditorSlashTrigger,
} from "@inboxzero/email-editor/web";
import { SnippetForm } from "@/components/snippets/SnippetForm";
import {
  SnippetPicker,
  type SnippetPickerRef,
} from "@/components/snippets/SnippetPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip } from "@/components/Tooltip";
import { useSnippets } from "@/hooks/useSnippets";
import { createSnippetSlashExtension } from "./snippet-slash-extension";
import {
  snippetContentToHtml,
  snippetVariablesFromRecipient,
} from "@/utils/snippets/expand-snippet";
import {
  normalizeSnippetQuery,
  type SnippetMatchItem,
} from "@/utils/snippets/match-snippets";
import type { CreateSnippetBody } from "@/utils/actions/snippet.validation";

const EMPTY_SNIPPETS: SnippetMatchItem[] = [];

export function useComposeSnippets({
  editorRef,
  to,
}: {
  editorRef: RefObject<EmailEditorHandle | null>;
  to?: string;
}) {
  const { data, mutate } = useSnippets();
  const snippets = data?.snippets ?? EMPTY_SNIPPETS;
  const snippetsRef = useRef(snippets);
  snippetsRef.current = snippets;
  const toRef = useRef(to);
  toRef.current = to;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [formState, setFormState] = useState<{
    defaults?: Partial<CreateSnippetBody>;
    insertOnCreate: boolean;
    open: boolean;
  }>({ open: false, insertOnCreate: false });
  const closeForm = useCallback(() => {
    setFormState({ insertOnCreate: false, open: false });
  }, []);

  const [slashTrigger, setSlashTrigger] =
    useState<EmailEditorSlashTrigger | null>(null);
  const slashPickerRef = useRef<SnippetPickerRef>(null);

  const snippetHtml = useCallback(
    (snippet: SnippetMatchItem) =>
      snippetContentToHtml(
        snippet.content,
        snippetVariablesFromRecipient(toRef.current),
      ),
    [],
  );
  const insertSnippet = useCallback(
    (snippet: SnippetMatchItem, range?: { from: number; to: number }) => {
      editorRef.current?.insertHtml(snippetHtml(snippet), range);
    },
    [editorRef, snippetHtml],
  );
  const insertSnippetRef = useRef(insertSnippet);
  insertSnippetRef.current = insertSnippet;

  const openCreate = useCallback(
    (
      defaults?: Partial<CreateSnippetBody>,
      options?: { insertOnCreate?: boolean },
    ) => {
      setPickerOpen(false);
      setFormState({
        defaults: {
          content:
            defaults?.content ?? editorRef.current?.getSelectedText() ?? "",
          shortcut: defaults?.shortcut ?? "",
        },
        insertOnCreate: options?.insertOnCreate ?? false,
        open: true,
      });
    },
    [editorRef],
  );
  const openCreateRef = useRef(openCreate);
  openCreateRef.current = openCreate;

  const extraExtensions = useMemo(
    () => [
      createSnippetSlashExtension({
        getSnippets: () => snippetsRef.current,
        insertSnippet: (snippet, range) => {
          insertSnippetRef.current(snippet, range);
        },
        onCreate: ({ shortcut }) => {
          openCreateRef.current(
            {
              shortcut,
            },
            { insertOnCreate: true },
          );
        },
      }),
    ],
    [],
  );

  const onSlashKeyDown = useCallback(
    (event: KeyboardEvent) =>
      slashPickerRef.current?.onKeyDown({ event }) ?? false,
    [],
  );

  const toolbar = (
    <>
      {slashTrigger &&
        createPortal(
          <div
            className="fixed z-[100]"
            style={{
              left: slashTrigger.rect.left,
              top: slashTrigger.rect.bottom + 4,
            }}
          >
            <SnippetPicker
              onSelectCreate={() => {
                editorRef.current?.replaceSlashTrigger("");
                openCreate(
                  { shortcut: normalizeSnippetQuery(slashTrigger.query) },
                  { insertOnCreate: true },
                );
              }}
              onSelectSnippet={(snippet) => {
                editorRef.current?.replaceSlashTrigger(snippetHtml(snippet));
              }}
              query={slashTrigger.query}
              ref={slashPickerRef}
              snippets={snippets}
            />
          </div>,
          document.body,
        )}
      <Popover
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setPickerQuery("");
        }}
        open={pickerOpen}
      >
        <Tooltip content="Insert snippet">
          <PopoverTrigger asChild>
            <Button
              aria-label="Insert snippet"
              className="hover:bg-transparent"
              size="icon"
              type="button"
              variant="ghostMuted"
            >
              <BracesIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent
          align="end"
          className="w-auto border-0 bg-transparent p-0 shadow-none"
          data-snippet-picker=""
        >
          <SnippetPicker
            onQueryChange={setPickerQuery}
            onSelectCreate={() => {
              openCreate({
                content: editorRef.current?.getSelectedText() ?? "",
              });
            }}
            onSelectSnippet={(snippet) => {
              setPickerOpen(false);
              insertSnippet(snippet);
            }}
            query={pickerQuery}
            snippets={snippets}
          />
        </PopoverContent>
      </Popover>
      <Dialog
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
        open={formState.open}
      >
        <DialogContent
          className="max-w-lg"
          data-snippet-picker=""
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Save snippet</DialogTitle>
            <DialogDescription className="sr-only">
              Save a reusable snippet.
            </DialogDescription>
          </DialogHeader>
          <SnippetForm
            closeDialog={closeForm}
            initialValues={formState.defaults}
            onCreated={(snippet) => {
              if (formState.insertOnCreate) insertSnippet(snippet);
            }}
            refetch={() => {
              mutate();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    extraExtensions,
    onSlashKeyDown,
    onSlashTrigger: setSlashTrigger,
    toolbar,
  };
}
