"use client";

import type React from "react";
import { useRef, useEffect, useCallback, memo, useMemo } from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import type { UseChatHelpers } from "@ai-sdk/react";
import { ArrowUpIcon } from "lucide-react";
import { StopIcon } from "./icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
// import { SuggestedActions } from "./suggested-actions";
import { cn } from "@/utils";
import type { ChatMessage } from "@/components/assistant-chat/types";

function PureMultimodalInput({
  // chatId,
  input,
  setInput,
  status,
  stop,
  // messages,
  setMessages,
  // append,
  handleSubmit,
  className,
}: {
  // chatId?: string;
  input: string;
  setInput: (input: string) => void;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  // attachments: Array<Attachment>;
  // setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  // messages: Array<UIMessage>;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  // append: UseChatHelpers["append"];
  handleSubmit: () => void;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();

  const wordCount = useMemo(() => {
    return input
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }, [input]);

  const WORD_LIMIT = 3000;
  const isOverLimit = wordCount > WORD_LIMIT;
  const isNearLimit = wordCount > WORD_LIMIT * 0.8; // Warning at 80% of limit

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  // Adjust height whenever input changes (from any source)
  // biome-ignore lint/correctness/useExhaustiveDependencies: We want to adjust height when input changes
  useEffect(() => {
    adjustHeight();
  }, [input]);

  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = "98px";
    }
  };

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    "",
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: how vercel chat template had it
  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
  }, []);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    // adjustHeight(); // handled in useEffect
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: how vercel chat template had it
  const submitForm = useCallback(() => {
    // window.history.replaceState({}, "", `/chat/${chatId}`);

    handleSubmit();

    setLocalStorageInput("");
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [handleSubmit, setLocalStorageInput, width]);

  return (
    <div className="relative flex w-full flex-col gap-4">
      {/* {messages.length === 0 && (
        <SuggestedActions append={append} chatId={chatId} />
      )} */}

      <Textarea
        data-testid="multimodal-input"
        ref={textareaRef}
        placeholder="Send a message..."
        value={input}
        onChange={handleInput}
        className={cn(
          "max-h-[calc(75dvh)] min-h-[24px] resize-y overflow-auto rounded-2xl bg-muted pb-10 !text-base dark:border-zinc-700",
          className,
        )}
        rows={2}
        autoFocus
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();

            if (status !== "ready") {
              toast.error("Please wait for the model to finish its response!");
            } else {
              submitForm();
            }
          }
        }}
      />

      <div className="absolute bottom-0 left-0 right-0 flex flex-row justify-between items-center p-2">
        <div className="flex items-center text-xs text-muted-foreground">
          <span
            className={cn(
              "transition-colors",
              isOverLimit
                ? "text-red-500"
                : isNearLimit
                  ? "text-yellow-500"
                  : "text-muted-foreground",
            )}
          >
            {wordCount}/{WORD_LIMIT} words
          </span>
        </div>
        <div className="flex w-fit flex-row justify-end">
          {status === "submitted" ? (
            <StopButton stop={stop} setMessages={setMessages} />
          ) : (
            <SendButton
              input={input}
              submitForm={submitForm}
              disabled={isOverLimit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) return false;
    if (prevProps.status !== nextProps.status) return false;
    // if (!equal(prevProps.attachments, nextProps.attachments)) return false;

    return true;
  },
);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      data-testid="stop-button"
      className="h-fit rounded-full border p-1.5 dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

function PureSendButton({
  submitForm,
  input,
  disabled = false,
}: {
  submitForm: () => void;
  input: string;
  disabled?: boolean;
}) {
  return (
    <Button
      data-testid="send-button"
      className="h-fit rounded-full border p-1.5 dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        submitForm();
      }}
      disabled={input.length === 0 || disabled}
    >
      <ArrowUpIcon size={14} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.input !== nextProps.input) return false;
  if (prevProps.disabled !== nextProps.disabled) return false;
  return true;
});
