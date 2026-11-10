"use client";

import { useEffect, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MessageCircleIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThreadContent } from "@/components/EmailViewer";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";

export function MailPreviewOverlay({
  threadId,
  onClose,
  onNavigate,
  onOpenInReader,
}: {
  threadId: string;
  onClose: () => void;
  onNavigate: (threadId: string) => void;
  onOpenInReader: () => void;
}) {
  const { provider } = useAccount();
  // The chat's cards live in another part of the page, so their order is read
  // from the document. It's re-read on every step, so new cards are picked up.
  const [position, setPosition] = useState(() => getPosition(threadId));

  useEffect(() => {
    setPosition(getPosition(threadId));
    getChatCard(threadId)?.scrollIntoView({ block: "nearest" });
  }, [threadId]);

  useEffect(() => {
    function step(offset: number) {
      const { threadIds, index } = getPosition(threadId);
      const next = threadIds[index + offset];
      if (index !== -1 && next) onNavigate(next);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") onClose();
      else if (event.key === "j") step(1);
      else if (event.key === "k") step(-1);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [threadId, onClose, onNavigate]);

  const previous = position.threadIds[position.index - 1];
  const next = position.threadIds[position.index + 1];

  return (
    <section
      aria-label="Email from chat"
      className="absolute inset-0 z-30 flex flex-col bg-background"
    >
      <div className="flex items-center gap-1 border-b bg-muted/40 px-3 py-1.5">
        <MessageCircleIcon className="size-3.5 text-muted-foreground" />
        <span className="text-muted-foreground text-xs">
          From chat
          {position.index !== -1 && position.threadIds.length > 1
            ? ` · ${position.index + 1} of ${position.threadIds.length}`
            : null}
        </span>
        <Button
          aria-label="Previous email from chat"
          className="ml-1"
          disabled={!previous}
          Icon={ChevronUpIcon}
          onClick={() => previous && onNavigate(previous)}
          size="iconXs"
          variant="ghost"
        />
        <Button
          aria-label="Next email from chat"
          disabled={!next}
          Icon={ChevronDownIcon}
          onClick={() => next && onNavigate(next)}
          size="iconXs"
          variant="ghost"
        />
        <div className="ml-auto flex items-center gap-1">
          <Button size="xs-2" variant="ghost" onClick={onOpenInReader}>
            Open in reader
          </Button>
          <Button
            aria-label="Close email"
            size="iconXs"
            variant="ghost"
            Icon={XIcon}
            onClick={onClose}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <ThreadContent
          key={threadId}
          threadId={threadId}
          showReplyButton={isGoogleProvider(provider)}
        />
      </div>
    </section>
  );
}

function getPosition(threadId: string) {
  const threadIds = [
    ...new Set(
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-chat-email-thread-id]"),
        (element) => element.dataset.chatEmailThreadId ?? "",
      ).filter(Boolean),
    ),
  ];
  return { threadIds, index: threadIds.indexOf(threadId) };
}

function getChatCard(threadId: string) {
  return document.querySelector<HTMLElement>(
    `[data-chat-email-thread-id="${CSS.escape(threadId)}"]`,
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}
