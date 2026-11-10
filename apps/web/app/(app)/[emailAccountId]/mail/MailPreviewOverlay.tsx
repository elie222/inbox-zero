"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MessageCircleIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStableCallback } from "@/app/(app)/[emailAccountId]/mail/use-stable-callback";
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
  const sectionRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Announce the email by moving focus in. It's non-modal, so the chat stays
  // usable and there's no focus trap.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Closing from inside the overlay hands focus back to the email's chat card
  // rather than dropping it on the page body.
  const close = useStableCallback(() => {
    const hadFocus = sectionRef.current?.contains(document.activeElement);
    const card = getChatCard(threadId);
    onClose();
    if (hadFocus) card?.focus();
  });

  useEffect(() => {
    setPosition(getPosition(threadId));
    getChatCard(threadId)?.scrollIntoView({ block: "nearest" });
  }, [threadId]);

  // Cards keep arriving while the chat streams, so recount when the page changes.
  useEffect(() => {
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = getPosition(threadId);
        setPosition((current) =>
          samePosition(current, next) ? current : next,
        );
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
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
      if (event.key === "Escape") close();
      else if (event.key === "j") step(1);
      else if (event.key === "k") step(-1);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [threadId, close, onNavigate]);

  const previous = position.threadIds[position.index - 1];
  const next = position.threadIds[position.index + 1];

  return (
    <section
      ref={sectionRef}
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
            onClick={close}
            ref={closeButtonRef}
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

function samePosition(
  a: ReturnType<typeof getPosition>,
  b: ReturnType<typeof getPosition>,
) {
  return (
    a.index === b.index &&
    a.threadIds.length === b.threadIds.length &&
    a.threadIds.every((threadId, index) => threadId === b.threadIds[index])
  );
}

function getChatCard(threadId: string) {
  return document.querySelector<HTMLElement>(
    `[data-chat-email-thread-id="${CSS.escape(threadId)}"]`,
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    // Menus and lists use letter keys for typeahead.
    Boolean(target.closest('[role="menu"],[role="listbox"]')) ||
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}
