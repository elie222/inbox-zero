"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  HistoryIcon,
  Loader2,
  MoreHorizontalIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useSWRConfig } from "swr";
import { Messages } from "./messages";
import { PreviewAttachment } from "./preview-attachment";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useChats } from "@/hooks/useChats";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { useChat } from "@/providers/ChatProvider";
import type { Attachment } from "@/providers/ChatProvider";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { useLocalStorage } from "usehooks-ts";
import { useSession } from "@/utils/auth-client";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatMessage } from "@/components/assistant-chat/types";
import type { MessageContext } from "@/app/api/chat/validation";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { deleteChatAction, renameChatAction } from "@/utils/actions/chat";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_FILES = 5;
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export function Chat({ open }: { open: boolean }) {
  const analytics = useProductAnalytics("assistant_chat");
  const {
    chat,
    chatId,
    input,
    persistedMessageIds,
    setInput,
    handleSubmit,
    setNewChat,
    context,
    setContext,
    attachments,
    setAttachments,
  } = useChat();
  const { messages, status, stop, regenerate, setMessages } = chat;
  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    "",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);

  useEffect(() => {
    if (open && !chatId && status === "ready" && messages.length === 0) {
      setNewChat();
    }
  }, [open, chatId, messages.length, setNewChat, status]);

  // Sync input with localStorage
  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  // Load from localStorage on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run on mount
  useEffect(() => {
    if (localStorageInput) {
      setInput(localStorageInput);
    }
  }, []);

  const readFileAsDataUrl = useCallback(
    (file: File): Promise<Attachment | undefined> =>
      new Promise((resolve) => {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          resolve(undefined);
          return;
        }
        if (file.size > MAX_FILE_SIZE) {
          resolve(undefined);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            id: crypto.randomUUID(),
            name: file.name,
            url: reader.result as string,
            contentType: file.type,
          });
        };
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      }),
    [],
  );

  const processIncomingFiles = useCallback(
    async (files: File[]) => {
      const remaining = MAX_FILES - attachments.length;
      const filesToProcess = files.slice(0, remaining);

      setUploadQueue(filesToProcess.map((f) => f.name));

      const results = await Promise.all(filesToProcess.map(readFileAsDataUrl));
      const valid = results.filter((a): a is Attachment => a !== undefined);

      analytics.captureAction("chat_attachments_added", {
        requested_file_count: files.length,
        accepted_file_count: valid.length,
        existing_attachment_count: attachments.length,
      });
      setAttachments((prev) => [...prev, ...valid]);
      setUploadQueue([]);
    },
    [analytics, attachments.length, readFileAsDataUrl, setAttachments],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;

      await processIncomingFiles(files);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [processIncomingFiles],
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageFiles = Array.from(items)
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (imageFiles.length === 0) return;

      event.preventDefault();
      await processIncomingFiles(imageFiles);
    },
    [processIncomingFiles],
  );

  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0];
  const hasMessages = messages.length > 0;
  const hasContent =
    input.trim().length > 0 || attachments.length > 0 || !!context;

  const inputArea = (
    <PromptInput
      onSubmit={(e) => {
        e.preventDefault();
        if (hasContent && status === "ready") {
          analytics.captureAction("chat_message_submitted", {
            has_text: input.trim().length > 0,
            attachment_count: attachments.length,
            has_context: Boolean(context),
            message_count: messages.length,
          });
          handleSubmit();
          setLocalStorageInput("");
        }
      }}
      className="relative divide-y-0 rounded-2xl"
    >
      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div className="flex gap-2 overflow-x-auto p-2 pb-0">
          {attachments.map((attachment) => (
            <PreviewAttachment
              key={attachment.id}
              attachment={attachment}
              onRemove={() =>
                setAttachments((prev) => prev.filter((a) => a !== attachment))
              }
            />
          ))}
          {uploadQueue.map((name) => (
            <PreviewAttachment
              key={name}
              attachment={{ name, url: "", contentType: "" }}
              isUploading
            />
          ))}
        </div>
      )}

      <PromptInputTextarea
        data-testid="chat-input"
        value={input}
        placeholder="Ask me anything"
        onChange={(e) => setInput(e.currentTarget.value)}
        onPaste={handlePaste}
        className="pr-24"
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={handleFileChange}
        tabIndex={-1}
      />

      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        <Tooltip content="Attach images">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => {
              analytics.captureAction("chat_attach_button_clicked", {
                attachment_count: attachments.length,
              });
              fileInputRef.current?.click();
            }}
            disabled={attachments.length >= MAX_FILES}
          >
            <PaperclipIcon className="size-4" />
          </Button>
        </Tooltip>

        <PromptInputSubmit
          status={
            status === "streaming"
              ? "streaming"
              : status === "submitted"
                ? "submitted"
                : "ready"
          }
          disabled={status === "ready" ? !hasContent : status === "error"}
          className="h-9 w-9 rounded-full bg-blue-500 text-white hover:bg-blue-600"
          onClick={(e) => {
            if (status === "streaming" || status === "submitted") {
              analytics.captureAction("chat_generation_stopped", {
                status,
              });
              e.preventDefault();
              stop();
              setMessages((messages) => messages);
            }
          }}
        >
          {status === "submitted" ? (
            <Loader2 className="size-5 animate-spin" />
          ) : status === "streaming" ? (
            <SquareIcon className="size-4" />
          ) : (
            <ArrowUpIcon className="size-5" />
          )}
        </PromptInputSubmit>
      </div>
    </PromptInput>
  );

  return (
    <div
      className="flex h-full min-w-0 flex-col"
      style={
        {
          "--chat-px": "1.5rem",
          "--chat-max-w": "800px",
        } as React.CSSProperties
      }
    >
      <ChatTopBar hasMessages={hasMessages} />
      {hasMessages ? (
        <ChatMessagesView
          status={status}
          messages={messages}
          persistedMessageIds={persistedMessageIds}
          setMessages={setMessages}
          setInput={setInput}
          regenerate={regenerate}
          context={context}
          setContext={setContext}
          inputArea={inputArea}
        />
      ) : (
        <NewChatView
          firstName={firstName}
          inputArea={inputArea}
          onSuggestionClick={(text) => {
            analytics.captureAction("chat_suggestion_clicked", {
              suggestion_index: CHAT_EXAMPLES.indexOf(text),
            });
            chat.sendMessage({
              role: "user",
              parts: [{ type: "text", text }],
            });
            setLocalStorageInput("");
          }}
        />
      )}
    </div>
  );
}

function ChatMessagesView({
  status,
  messages,
  persistedMessageIds,
  setMessages,
  setInput,
  regenerate,
  context,
  setContext,
  inputArea,
}: {
  status: UseChatHelpers<ChatMessage>["status"];
  messages: ChatMessage[];
  persistedMessageIds: Set<string>;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  setInput: (input: string) => void;
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  context: MessageContext | null;
  setContext: (context: MessageContext | null) => void;
  inputArea: React.ReactNode;
}) {
  return (
    <>
      <div className="pointer-events-none h-2 -mb-2 z-10 bg-gradient-to-b from-background to-transparent" />
      <Messages
        status={status}
        messages={messages}
        persistedMessageIds={persistedMessageIds}
        setMessages={setMessages}
        setInput={setInput}
        regenerate={regenerate}
        isArtifactVisible={false}
        footer={
          <>
            {context ? (
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  Fix: {context.message.headers.subject.slice(0, 60)}
                  {context.message.headers.subject.length > 60 ? "..." : ""}
                  <button
                    type="button"
                    aria-label="Remove context"
                    className="ml-1 rounded p-0.5 hover:bg-muted-foreground/10"
                    onClick={() => setContext(null)}
                  >
                    ×
                  </button>
                </span>
              </div>
            ) : null}
            <div className="relative z-10">{inputArea}</div>
            <div className="absolute w-full bottom-0 h-20 bg-background pointer-events-none" />
          </>
        }
      />
    </>
  );
}

const CHAT_EXAMPLES = [
  "Help me handle my inbox today",
  "Clean up my inbox",
  "Suggest rules I should add",
];

function NewChatView({
  firstName,
  inputArea,
  onSuggestionClick,
}: {
  firstName: string | undefined;
  inputArea: React.ReactNode;
  onSuggestionClick: (text: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-[var(--chat-px)]">
      <div className="w-full max-w-[var(--chat-max-w)]">
        <h1 className="mb-6 text-center text-2xl sm:text-3xl md:text-4xl font-extralight tracking-tight">
          {getGreeting(firstName)}
        </h1>
        {inputArea}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {CHAT_EXAMPLES.map((example) => (
            <Button
              key={example}
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => onSuggestionClick(example)}
            >
              {example}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatTopBar({ hasMessages }: { hasMessages: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-[calc(var(--chat-max-w)+var(--chat-px)*2)] px-[var(--chat-px)] pt-2">
      <div className="flex items-center justify-end gap-1">
        {hasMessages ? (
          <>
            <NewChatButton />
            <ChatHistoryDropdown />
          </>
        ) : (
          <ChatHistoryDropdown />
        )}
      </div>
    </div>
  );
}

function NewChatButton() {
  const { setNewChat } = useChat();

  return (
    <Tooltip content="Start a new conversation">
      <Button variant="ghost" size="icon" onClick={setNewChat}>
        <PlusIcon className="size-5" />
        <span className="sr-only">New Chat</span>
      </Button>
    </Tooltip>
  );
}

function ChatHistoryDropdown() {
  const [shouldLoadChats, setShouldLoadChats] = useState(false);
  const [open, setOpen] = useState(false);
  const { data, error, isLoading, mutate } = useChats(shouldLoadChats);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip content="View previous conversations">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onMouseEnter={() => setShouldLoadChats(true)}
            onClick={() => mutate()}
          >
            <HistoryIcon className="size-5" />
            <span className="sr-only">Chat History</span>
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-72">
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={
            <DropdownMenuItem
              disabled
              className="flex items-center justify-center"
            >
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading chats...
            </DropdownMenuItem>
          }
          errorComponent={
            <DropdownMenuItem disabled>Error loading chats</DropdownMenuItem>
          }
        >
          {data && data.chats.length > 0 ? (
            data.chats.map((chatItem) => (
              <ChatHistoryItem
                key={chatItem.id}
                chat={chatItem}
                onMutate={mutate}
                closeParent={() => setOpen(false)}
              />
            ))
          ) : (
            <DropdownMenuItem disabled>
              No previous chats found
            </DropdownMenuItem>
          )}
        </LoadingContent>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ChatHistoryItemData = {
  id: string;
  name: string | null;
  createdAt: string | Date;
};

function ChatHistoryItem({
  chat,
  onMutate,
  closeParent,
}: {
  chat: ChatHistoryItemData;
  onMutate: () => void;
  closeParent: () => void;
}) {
  const { chatId, setChatId } = useChat();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const label =
    chat.name ?? `Chat from ${new Date(chat.createdAt).toLocaleString()}`;

  return (
    <>
      <div className="group/chat-row relative flex items-center">
        <DropdownMenuItem
          className="flex-1 truncate pr-9"
          onSelect={() => setChatId(chat.id)}
        >
          <span className="truncate">{label}</span>
        </DropdownMenuItem>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Chat options"
              className={
                "absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus:opacity-100 focus:outline-none " +
                (menuOpen
                  ? "opacity-100"
                  : "opacity-0 group-hover/chat-row:opacity-100")
              }
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setMenuOpen(true);
              }}
            >
              <MoreHorizontalIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setMenuOpen(false);
                closeParent();
                setRenameOpen(true);
              }}
            >
              <PencilIcon className="mr-2 size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setMenuOpen(false);
                closeParent();
                setDeleteOpen(true);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2Icon className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <RenameChatDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        chatId={chat.id}
        currentName={chat.name ?? ""}
        defaultLabel={label}
        onRenamed={onMutate}
      />
      <DeleteChatDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        chatId={chat.id}
        label={label}
        onDeleted={() => {
          if (chatId === chat.id) setChatId(null);
          onMutate();
        }}
      />
    </>
  );
}

function RenameChatDialog({
  open,
  onOpenChange,
  chatId,
  currentName,
  defaultLabel,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  currentName: string;
  defaultLabel: string;
  onRenamed: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { mutate: globalMutate } = useSWRConfig();
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  const { execute, isExecuting } = useAction(
    renameChatAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Chat renamed." });
        onRenamed();
        globalMutate(`/api/chats/${chatId}`);
        onOpenChange(false);
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to rename chat",
          }),
        });
      },
    },
  );

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== currentName.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            execute({ chatId, name: trimmed });
          }}
        >
          <Input
            type="text"
            name="name"
            placeholder={defaultLabel}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isExecuting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isExecuting} disabled={!canSubmit}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteChatDialog({
  open,
  onOpenChange,
  chatId,
  label,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  label: string;
  onDeleted: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { execute, isExecuting } = useAction(
    deleteChatAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Chat deleted." });
        onDeleted();
        onOpenChange(false);
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to delete chat",
          }),
        });
      },
    },
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete chat?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete &ldquo;{label}&rdquo; and all of its
            messages. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isExecuting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              execute({ chatId });
            }}
            disabled={isExecuting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isExecuting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getGreeting(firstName: string | undefined): string {
  const hour = new Date().getHours();
  const name = firstName ? `, ${firstName}` : "";
  if (hour < 5) return `Hey there${name}`;
  if (hour < 12) return `Good morning${name}`;
  if (hour < 18) return `Good afternoon${name}`;
  return `Good evening${name}`;
}
