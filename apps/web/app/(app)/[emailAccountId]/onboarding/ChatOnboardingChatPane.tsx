"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, ArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ButtonLoader } from "@/components/Loading";
import { cn } from "@/utils";

export type ChatOnboardingMessage = {
  id: number;
  from: "assistant" | "user";
  text: string;
};

export function ChatOnboardingChatPane({
  messages,
  typing,
  awaiting,
  chips,
  placeholder,
  onRespond,
  cta,
  inlineArtifact,
}: {
  messages: ChatOnboardingMessage[];
  typing: boolean;
  awaiting: boolean;
  chips?: string[];
  placeholder?: string;
  onRespond: (text: string, isFreeform: boolean) => void;
  cta?: { label: string; loading: boolean; onClick: () => void } | null;
  // Compact artifact rendered inside the conversation on small screens where
  // the side panel is hidden
  inlineArtifact?: React.ReactNode;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: these values intentionally trigger scrolling when conversation state changes
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing, awaiting, cta?.label, cta?.loading]);

  const sendFreeform = () => {
    const text = input.trim();
    if (!text || !awaiting) return;
    setInput("");
    onRespond(text, true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-5 pb-2">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {typing && (
          <div className="mb-3.5 flex items-center gap-2.5">
            <AssistantAvatar />
            <div className="flex items-center gap-1 rounded-2xl bg-slate-100 px-4 py-3.5 dark:bg-slate-800">
              <TypingDot delay="0ms" />
              <TypingDot delay="200ms" />
              <TypingDot delay="400ms" />
            </div>
          </div>
        )}

        {cta && (
          <div className="mb-3.5 ml-[38px]">
            <Button onClick={cta.onClick} disabled={cta.loading}>
              {cta.loading && <ButtonLoader />}
              {cta.label}
              <ArrowRightIcon className="ml-2 size-4" />
            </Button>
          </div>
        )}

        {inlineArtifact && (
          <div className="mb-3.5 lg:hidden">{inlineArtifact}</div>
        )}
      </div>

      {awaiting && (
        <div className="border-t bg-background px-5 pb-4 pt-3">
          {!!chips?.length && (
            <div className="mb-2.5 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="rounded-full border bg-background px-3.5 py-1.5 text-sm text-foreground transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:border-blue-800 dark:hover:bg-blue-950"
                  onClick={() => onRespond(chip, false)}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendFreeform();
                }
              }}
              placeholder={placeholder || "Type a message…"}
            />
            <Button
              size="icon"
              className="shrink-0"
              onClick={sendFreeform}
              disabled={!input.trim()}
              aria-label="Send message"
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatOnboardingMessage }) {
  if (message.from === "user") {
    return (
      <div className="mb-3.5 flex justify-end duration-300 animate-in fade-in slide-in-from-bottom-2">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-3.5 py-2.5 text-sm leading-relaxed text-white">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3.5 flex items-start gap-2.5 duration-300 animate-in fade-in slide-in-from-bottom-2">
      <AssistantAvatar />
      <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 dark:bg-slate-800 dark:text-slate-100">
        {message.text}
      </div>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <Image
      src="/icons/icon-192x192.png"
      alt=""
      width={28}
      height={28}
      className="mt-0.5 shrink-0 rounded-lg"
    />
  );
}

function TypingDot({ delay }: { delay: string }) {
  return (
    <span
      className={cn("size-1.5 animate-bounce rounded-full bg-slate-400")}
      style={{ animationDelay: delay }}
    />
  );
}
