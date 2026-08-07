"use client";

import Image from "next/image";
import type { ChangeEvent } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { Response } from "@/components/ai-elements/response";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import type { OnboardingChatMessage } from "@/app/(app)/[emailAccountId]/onboarding/chatOnboardingConfig";
import { cn } from "@/utils";

export type OnboardingChatStatus =
  | "submitted"
  | "streaming"
  | "ready"
  | "error";

export type ScanCard = {
  afterMessageId: string;
  state: "running" | "done";
  summary: string | null;
};

const ENTER_ANIMATION =
  "duration-300 animate-in fade-in slide-in-from-bottom-2";

export function ChatOnboardingChatPane({
  messages,
  status,
  chips,
  onSend,
  scanCard,
  belowConversation,
  cta,
  inlineCards,
  inputDisabled = false,
}: {
  messages: OnboardingChatMessage[];
  status: OnboardingChatStatus;
  chips: string[];
  onSend: (text: string, isFreeform: boolean) => void;
  scanCard: ScanCard | null;
  belowConversation?: React.ReactNode;
  cta?: { label: string; loading: boolean; onClick: () => void } | null;
  // Interactive cards rendered inline at the position of the tool call that
  // introduced them, keyed by toolCallId
  inlineCards?: Record<string, React.ReactNode>;
  inputDisabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleMessages = messages.filter(
    (message) => !message.metadata?.hidden,
  );
  const busy = status === "submitted" || status === "streaming";

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll tracks conversation growth including streamed token updates
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status, cta?.label, scanCard?.state]);

  const sendFreeform = () => {
    const text = input.trim();
    if (!text || busy || inputDisabled) return;
    setInput("");
    onSend(text, true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-2 pt-8">
        <div className="flex flex-col gap-4">
          <Image
            src="/icons/icon-192x192.png"
            alt=""
            width={36}
            height={36}
            className="rounded-lg"
          />

          {visibleMessages.map((message) => (
            <Fragment key={message.id}>
              <MessageItem message={message} inlineCards={inlineCards} />
              {scanCard?.afterMessageId === message.id && (
                <ScanCardView
                  state={scanCard.state}
                  summary={scanCard.summary}
                />
              )}
            </Fragment>
          ))}

          {status === "submitted" && (
            <div
              className={cn("flex items-center gap-1 py-1", ENTER_ANIMATION)}
            >
              <ThinkingDot delay="0ms" />
              <ThinkingDot delay="200ms" />
              <ThinkingDot delay="400ms" />
            </div>
          )}

          {!busy && belowConversation && (
            <div className={ENTER_ANIMATION}>{belowConversation}</div>
          )}

          {!busy && cta && (
            <div className={ENTER_ANIMATION}>
              <Button size="lg" onClick={cta.onClick} disabled={cta.loading}>
                {cta.loading && <ButtonLoader />}
                {cta.label}
                <ArrowRightIcon className="ml-2 size-4" />
              </Button>
            </div>
          )}

          {!busy && chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={cn(
                    "rounded-xl border bg-background px-3.5 py-2 text-sm transition-colors hover:bg-muted",
                    ENTER_ANIMATION,
                  )}
                  onClick={() => onSend(chip, false)}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 pb-5 pt-3">
        <PromptInput
          onSubmit={(e) => {
            e.preventDefault();
            sendFreeform();
          }}
        >
          <PromptInputTextarea
            value={input}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              setInput(e.currentTarget.value)
            }
            placeholder="Message"
            disabled={inputDisabled}
            className="pr-14"
          />

          <div className="absolute bottom-2 right-2">
            <PromptInputSubmit
              status={busy ? "submitted" : "ready"}
              disabled={!input.trim() || busy || inputDisabled}
              aria-label="Send message"
            />
          </div>
        </PromptInput>
      </div>
    </div>
  );
}

function MessageItem({
  message,
  inlineCards,
}: {
  message: OnboardingChatMessage;
  inlineCards?: Record<string, React.ReactNode>;
}) {
  if (message.role === "user") {
    const text = getMessageText(message);
    if (!text) return null;
    return (
      <div className={cn("flex justify-end", ENTER_ANIMATION)}>
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-[15px] leading-relaxed text-white">
          {text}
        </div>
      </div>
    );
  }

  return (
    <>
      {message.parts.map((part, index) => {
        if (part.type === "text" && part.text) {
          return (
            <div
              key={`${message.id}-${index}`}
              className={cn(
                "text-[15px] leading-relaxed text-foreground/90",
                ENTER_ANIMATION,
              )}
            >
              <Response>{part.text}</Response>
            </div>
          );
        }

        const card =
          "toolCallId" in part ? inlineCards?.[part.toolCallId] : undefined;
        if (card) {
          return <Fragment key={`${message.id}-${index}`}>{card}</Fragment>;
        }

        return null;
      })}
    </>
  );
}

function ScanCardView({
  state,
  summary,
}: {
  state: "running" | "done";
  summary: string | null;
}) {
  return (
    <div
      className={cn(
        "flex w-fit items-center gap-3 rounded-xl border bg-background px-3.5 py-2.5",
        ENTER_ANIMATION,
      )}
    >
      {state === "running" ? (
        <div className="flex h-3.5 items-center gap-[3px]">
          <ScanBar delay="0ms" />
          <ScanBar delay="180ms" />
          <ScanBar delay="360ms" />
        </div>
      ) : (
        <CheckIcon className="size-4 shrink-0 text-green-600" />
      )}
      <div>
        <div className="text-[13px] font-medium">
          {state === "running" ? "Scanning your inbox" : "Scan complete"}
        </div>
        {summary && (
          <div className="text-xs text-muted-foreground">{summary}</div>
        )}
      </div>
    </div>
  );
}

function ScanBar({ delay }: { delay: string }) {
  return (
    <span
      className="h-3.5 w-[3px] origin-center animate-pulse rounded-sm bg-blue-600"
      style={{ animationDelay: delay }}
    />
  );
}

function ThinkingDot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
      style={{ animationDelay: delay }}
    />
  );
}

function getMessageText(message: OnboardingChatMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}
