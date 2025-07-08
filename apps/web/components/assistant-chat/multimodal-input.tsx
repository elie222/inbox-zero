"use client";

import type React from "react";
import { useRef, useEffect, useCallback, memo, useState } from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import type { UseChatHelpers } from "@ai-sdk/react";
import { ArrowUpIcon } from "lucide-react";
import { StopIcon } from "./icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { extractEmailContentForTooltip } from "@/utils/email-display";
// import { SuggestedActions } from "./suggested-actions";
import { cn } from "@/utils";

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
  displayValue,
}: {
  // chatId?: string;
  input: UseChatHelpers["input"];
  setInput: UseChatHelpers["setInput"];
  status: UseChatHelpers["status"];
  stop: () => void;
  // attachments: Array<Attachment>;
  // setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  // messages: Array<UIMessage>;
  setMessages: UseChatHelpers["setMessages"];
  // append: UseChatHelpers["append"];
  handleSubmit: UseChatHelpers["handleSubmit"];
  className?: string;
  displayValue?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  }, []);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
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

  const handleFocus = () => {
    if (displayValue !== undefined && displayValue !== input) {
      setIsEditing(true);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const submitForm = useCallback(() => {
    // window.history.replaceState({}, "", `/chat/${chatId}`);

    handleSubmit(undefined);

    setLocalStorageInput("");
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [handleSubmit, setLocalStorageInput, width]);

  // Use displayValue if provided and not editing, otherwise use input
  const visibleValue =
    displayValue !== undefined && !isEditing ? displayValue : input;

  // Extract email content for tooltip
  const emailTooltipContent = extractEmailContentForTooltip(input);

  return (
    <div className="relative flex w-full flex-col gap-4">
      {/* {messages.length === 0 && (
        <SuggestedActions append={append} chatId={chatId} />
      )} */}

      {displayValue !== undefined && !isEditing && emailTooltipContent ? (
        <TooltipProvider>
          <div
            className={cn(
              "max-h-[calc(75dvh)] min-h-[24px] cursor-text resize-none overflow-hidden rounded-2xl bg-muted p-3 pb-10 !text-base dark:border-zinc-700",
              className,
            )}
            onClick={() => setIsEditing(true)}
          >
            <RichTextDisplay
              text={visibleValue}
              emailTooltipContent={emailTooltipContent}
            />
          </div>
        </TooltipProvider>
      ) : (
        <Textarea
          data-testid="multimodal-input"
          ref={textareaRef}
          placeholder="Send a message..."
          value={visibleValue}
          onChange={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={cn(
            "max-h-[calc(75dvh)] min-h-[24px] resize-none overflow-hidden rounded-2xl bg-muted pb-10 !text-base dark:border-zinc-700",
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
                toast.error(
                  "Please wait for the model to finish its response!",
                );
              } else {
                submitForm();
              }
            }
          }}
        />
      )}

      <div className="absolute bottom-0 right-0 flex w-fit flex-row justify-end p-2">
        {status === "submitted" ? (
          <StopButton stop={stop} setMessages={setMessages} />
        ) : (
          <SendButton input={input} submitForm={submitForm} />
        )}
      </div>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) return false;
    if (prevProps.status !== nextProps.status) return false;
    if (prevProps.displayValue !== nextProps.displayValue) return false;
    // if (!equal(prevProps.attachments, nextProps.attachments)) return false;

    return true;
  },
);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers["setMessages"];
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
}: {
  submitForm: () => void;
  input: string;
}) {
  return (
    <Button
      data-testid="send-button"
      className="h-fit rounded-full border p-1.5 dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        submitForm();
      }}
      disabled={input.length === 0}
    >
      <ArrowUpIcon size={14} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.input !== nextProps.input) return false;
  return true;
});

function RichTextDisplay({
  text,
  emailTooltipContent,
}: {
  text: string;
  emailTooltipContent: string;
}) {
  // Split text by lines to process each line
  const lines = text.split("\n");

  return (
    <div className="whitespace-pre-wrap">
      {lines.map((line, index) => {
        // Check if this line contains the email tag
        const emailTagMatch = line.match(/📧 \[([^\]]+)\]/);

        if (emailTagMatch) {
          const subject = emailTagMatch[1];
          const beforeTag = line.substring(0, line.indexOf("📧"));
          const afterTag = line.substring(
            line.indexOf("📧") + emailTagMatch[0].length,
          );

          return (
            <div key={index}>
              {beforeTag}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-help items-center rounded-md bg-blue-100 px-2 py-1 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-200">
                    📧 [{subject}]
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-md">
                  <div className="whitespace-pre-wrap text-sm">
                    {emailTooltipContent}
                  </div>
                </TooltipContent>
              </Tooltip>
              {afterTag}
            </div>
          );
        }

        return <div key={index}>{line}</div>;
      })}
    </div>
  );
}
