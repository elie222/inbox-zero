"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  HistoryIcon,
  Loader2,
  MailIcon,
  PaperclipIcon,
  PlusIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Messages } from "./messages";
import { PreviewAttachment } from "./preview-attachment";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChats } from "@/hooks/useChats";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { useChat } from "@/providers/ChatProvider";
import type { Attachment } from "@/providers/ChatProvider";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { useSession } from "@/utils/auth-client";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatMessage } from "@/components/assistant-chat/types";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { ChatHistoryItem } from "@/components/assistant-chat/ChatHistoryItem";
import {
  type ChatHistoryEntry,
  getChatHistoryLabel,
} from "@/components/assistant-chat/chat-history-types";
import { RenameChatDialog } from "@/components/assistant-chat/RenameChatDialog";
import { DeleteChatDialog } from "@/components/assistant-chat/DeleteChatDialog";
import { randomUuid } from "@/utils/uuid";
import { extractNameFromEmail } from "@/utils/email";
import type { MessageContext } from "@/utils/ai/assistant/chat-context-validation";
import { VoiceInput } from "@/components/voice/VoiceInput";
import { liveHistoryFromUiMessages } from "@/utils/voice/live-history";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_FILES = 5;
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export function Chat({
  open,
  onClose,
}: {
  open: boolean;
  onClose?: () => void;
}) {
  const { t, i18n } = useLingui();
  const analytics = useProductAnalytics("assistant_chat");
  const {
    chat,
    chatId,
    input,
    persistedMessageIds,
    sendError,
    setInput,
    handleSubmit,
    setNewChat,
    context,
    setContext,
    attachments,
    setAttachments,
    submitTextMessage,
    stop,
  } = useChat();
  const { messages, status, regenerate, setMessages } = chat;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);

  useEffect(() => {
    if (open && !chatId && status === "ready" && messages.length === 0) {
      setNewChat();
    }
  }, [open, chatId, messages.length, setNewChat, status]);

  // Must run before the save effect below, which would overwrite the draft.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run on mount
  useEffect(() => {
    const savedInput = readDraftInput();
    if (savedInput) setInput(savedInput);
  }, []);

  // Persist without setting state: a state update here queued an extra render
  // per keystroke, and fast text entry tripped React's update-depth guard.
  useEffect(() => {
    saveDraftInput(input);
  }, [input]);

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
            id: randomUuid(),
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
  const hasContent = input.trim().length > 0 || attachments.length > 0;

  const inputArea = (
    <PromptInput
      onSubmit={(e) => {
        e.preventDefault();
        if (hasContent && (status === "ready" || status === "error")) {
          analytics.captureAction("chat_message_submitted", {
            has_text: input.trim().length > 0,
            attachment_count: attachments.length,
            has_context: Boolean(context),
            message_count: messages.length,
          });
          handleSubmit();
        }
      }}
    >
      {sendError ? (
        <ChatSendError
          message={sendError.message}
          onNewChat={sendError.offerNewChat ? setNewChat : undefined}
        />
      ) : null}
      {context ? (
        <ChatContextChip context={context} onRemove={() => setContext(null)} />
      ) : null}
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
        placeholder={t`Ask me anything`}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
          setInput(e.currentTarget.value)
        }
        onPaste={handlePaste}
        className="pr-48"
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
        <VoiceInput
          liveEnabled
          liveHistory={liveHistoryFromUiMessages(messages)}
          onInsert={(text) => {
            setInput(input.trim() ? `${input.trim()} ${text}` : text);
          }}
          onSend={(text) => {
            analytics.captureAction("chat_message_submitted", {
              has_text: true,
              attachment_count: attachments.length,
              has_context: Boolean(context),
              message_count: messages.length,
              via_voice: true,
            });
            // A dictated message has no draft, so keep it for a retry.
            submitTextMessage(text).catch(() => {
              setInput((current) =>
                current.trim() ? `${text}\n\n${current}` : text,
              );
            });
          }}
        />
        <Tooltip content={t`Attach images`}>
          <Button
            type="button"
            variant="ghostMuted"
            size="icon"
            aria-label={t`Attach images`}
            className="size-9 rounded-full"
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
          disabled={
            status === "ready" || status === "error" ? !hasContent : false
          }
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
        />
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
      <ChatTopBar hasMessages={hasMessages} onClose={onClose} />
      {hasMessages ? (
        <ChatMessagesView
          status={status}
          messages={messages}
          persistedMessageIds={persistedMessageIds}
          setMessages={setMessages}
          setInput={setInput}
          regenerate={regenerate}
          inputArea={inputArea}
        />
      ) : (
        <NewChatView
          greeting={context ? null : getGreeting(firstName, i18n)}
          suggestions={
            context ? [] : CHAT_EXAMPLES.map((example) => i18n._(example))
          }
          inputArea={inputArea}
          onSuggestionClick={(text, index) => {
            analytics.captureAction("chat_suggestion_clicked", {
              suggestion_index: index,
            });
            submitTextMessage(text).catch(() => undefined);
            saveDraftInput("");
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
  inputArea,
}: {
  status: UseChatHelpers<ChatMessage>["status"];
  messages: ChatMessage[];
  persistedMessageIds: Set<string>;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  setInput: (input: string) => void;
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
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
            <div className="relative z-10">{inputArea}</div>
            <div className="absolute w-full bottom-0 h-20 bg-background pointer-events-none" />
          </>
        }
      />
    </>
  );
}

const CHAT_EXAMPLES = [
  msg`Help me handle my inbox today`,
  msg`Clean up my inbox`,
  msg`Suggest rules I should add`,
];

function NewChatView({
  greeting,
  suggestions,
  inputArea,
  onSuggestionClick,
}: {
  greeting: string | null;
  suggestions: string[];
  inputArea: React.ReactNode;
  onSuggestionClick: (text: string, index: number) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-[var(--chat-px)]">
      <div className="w-full max-w-[var(--chat-max-w)]">
        {greeting ? (
          <h1 className="mb-6 text-center text-2xl sm:text-3xl md:text-4xl font-extralight tracking-tight">
            {greeting}
          </h1>
        ) : null}
        {inputArea}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {suggestions.map((example, index) => (
            <Button
              key={example}
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => onSuggestionClick(example, index)}
            >
              {example}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatTopBar({
  hasMessages,
  onClose,
}: {
  hasMessages: boolean;
  onClose?: () => void;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[calc(var(--chat-max-w)+var(--chat-px)*2)] px-[var(--chat-px)] pt-2">
      <div className="flex items-center justify-end gap-1">
        {hasMessages ? <NewChatButton /> : null}
        <ChatHistoryDropdown />
        {onClose ? <CloseChatButton onClose={onClose} /> : null}
      </div>
    </div>
  );
}

function NewChatButton() {
  const { t } = useLingui();
  const { setNewChat } = useChat();

  return (
    <Tooltip content={t`Start a new conversation`}>
      <Button variant="ghost" size="icon" onClick={setNewChat}>
        <PlusIcon className="size-5" />
        <span className="sr-only">
          <Trans>New Chat</Trans>
        </span>
      </Button>
    </Tooltip>
  );
}

function CloseChatButton({ onClose }: { onClose: () => void }) {
  const { t } = useLingui();

  return (
    <Tooltip content={t`Close assistant`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label={t`Close assistant`}
      >
        <XIcon className="size-5" aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}

function ChatHistoryDropdown() {
  const { t, i18n } = useLingui();
  const [shouldLoadChats, setShouldLoadChats] = useState(false);
  const [open, setOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChatHistoryEntry | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<ChatHistoryEntry | null>(
    null,
  );
  const { chatId, setChatId } = useChat();
  const { data, error, isLoading, mutate } = useChats(shouldLoadChats);

  return (
    <>
      <DropdownMenu
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (value) setShouldLoadChats(true);
        }}
      >
        <Tooltip content={t`View previous conversations`}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onMouseEnter={() => setShouldLoadChats(true)}
              onClick={() => {
                setShouldLoadChats(true);
                mutate();
              }}
            >
              <HistoryIcon className="size-5" />
              <span className="sr-only">
                <Trans>Chat History</Trans>
              </span>
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
                <Trans>Loading chats...</Trans>
              </DropdownMenuItem>
            }
            errorComponent={
              <DropdownMenuItem disabled>
                <Trans>Error loading chats</Trans>
              </DropdownMenuItem>
            }
          >
            {data && data.chats.length > 0 ? (
              data.chats.map((chatItem) => (
                <ChatHistoryItem
                  key={chatItem.id}
                  chat={chatItem}
                  onSelect={() => {
                    setOpen(false);
                    setChatId(chatItem.id);
                  }}
                  onRename={() => {
                    setOpen(false);
                    setRenameTarget(chatItem);
                  }}
                  onDelete={() => {
                    setOpen(false);
                    setDeleteTarget(chatItem);
                  }}
                />
              ))
            ) : (
              <DropdownMenuItem disabled>
                <Trans>No previous chats found</Trans>
              </DropdownMenuItem>
            )}
          </LoadingContent>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameChatDialog
        open={renameTarget !== null}
        onOpenChange={(value) => {
          if (!value) setRenameTarget(null);
        }}
        chatId={renameTarget?.id ?? ""}
        currentName={renameTarget?.name ?? ""}
        defaultLabel={
          renameTarget ? getChatHistoryLabel(renameTarget, i18n) : ""
        }
        onRenamed={mutate}
      />
      <DeleteChatDialog
        open={deleteTarget !== null}
        onOpenChange={(value) => {
          if (!value) setDeleteTarget(null);
        }}
        chatId={deleteTarget?.id ?? ""}
        label={deleteTarget ? getChatHistoryLabel(deleteTarget, i18n) : ""}
        onDeleted={() => {
          if (deleteTarget && chatId === deleteTarget.id) setChatId(null);
          mutate();
        }}
      />
    </>
  );
}

function ChatSendError({
  message,
  onNewChat,
}: {
  message: string;
  onNewChat?: () => void;
}) {
  return (
    <div className="px-2 pt-2">
      <div
        role="alert"
        data-testid="chat-send-error"
        className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-sm text-destructive"
      >
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 flex-1">{message}</span>
        {onNewChat ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-auto shrink-0 px-1.5 py-0.5 text-destructive hover:text-destructive"
            onClick={onNewChat}
          >
            <Trans>New chat</Trans>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ChatContextChip({
  context,
  onRemove,
}: {
  context: MessageContext;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  const { subject, from } = context.message.headers;
  const Icon = context.type === "fix-rule" ? WrenchIcon : MailIcon;

  return (
    <div className="px-2 pt-2">
      <div
        data-testid="chat-context-card"
        className="flex max-w-full items-center gap-2.5 rounded-lg border bg-muted/40 py-1.5 pl-2.5 pr-1"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium">
            {subject || t`(no subject)`}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {extractNameFromEmail(from)}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="iconXs"
          aria-label={t`Remove email from chat`}
          className="shrink-0 text-muted-foreground"
          onClick={onRemove}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function getGreeting(firstName: string | undefined, i18n: I18n): string {
  const hour = new Date().getHours();
  if (hour < 5) {
    return firstName
      ? i18n._(msg`Hey there, ${firstName}`)
      : i18n._(msg`Hey there`);
  }
  if (hour < 12) {
    return firstName
      ? i18n._(msg`Good morning, ${firstName}`)
      : i18n._(msg`Good morning`);
  }
  if (hour < 18) {
    return firstName
      ? i18n._(msg`Good afternoon, ${firstName}`)
      : i18n._(msg`Good afternoon`);
  }
  return firstName
    ? i18n._(msg`Good evening, ${firstName}`)
    : i18n._(msg`Good evening`);
}

const DRAFT_INPUT_STORAGE_KEY = "input";

function readDraftInput(): string {
  try {
    const stored = window.localStorage.getItem(DRAFT_INPUT_STORAGE_KEY);
    const value: unknown = stored ? JSON.parse(stored) : "";
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function saveDraftInput(value: string) {
  try {
    window.localStorage.setItem(DRAFT_INPUT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked; the draft just won't survive a reload.
  }
}
