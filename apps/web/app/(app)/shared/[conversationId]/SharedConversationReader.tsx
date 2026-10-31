"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { MailMessageBody } from "@inboxzero/mail-ui/MailBody";
import { ArrowLeftIcon, PaperclipIcon, RefreshCwIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/Tooltip";
import { LoadingContent } from "@/components/LoadingContent";
import { ConversationDiscussionView } from "@/components/team-comments/ConversationDiscussion";
import { useConversationDiscussion } from "@/components/team-comments/use-conversation-discussion";
import { cn } from "@/utils";
import { formatShortDate } from "@/utils/date";
import {
  extractEmailAddress,
  extractNameFromEmail,
  formatRecipientNames,
  getInitials,
  splitRecipientList,
} from "@/utils/email";
import type { TeamMessagesResponse } from "@/app/api/team-comments/conversations/[conversationId]/messages/route";

export function SharedConversationReader({
  conversationId,
}: {
  conversationId: string;
}) {
  const memberId = useSearchParams().get("memberId");
  if (!memberId)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p>
          Open this conversation from{" "}
          <Link href="/shared" className="text-primary underline">
            Discussions
          </Link>
          .
        </p>
      </main>
    );
  return (
    <AuthorizedReader
      key={`${conversationId}:${memberId}`}
      conversationId={conversationId}
      memberId={memberId}
    />
  );
}

function AuthorizedReader({
  conversationId,
  memberId,
}: {
  conversationId: string;
  memberId: string;
}) {
  const access = useConversationDiscussion(memberId, conversationId);
  const messages = useSWR<TeamMessagesResponse>(
    `/api/team-comments/conversations/${conversationId}/messages?memberId=${encodeURIComponent(memberId)}`,
    { refreshInterval: 30_000 },
  );
  const accessErrorStatus = (
    access.summary.error as { status?: number } | undefined
  )?.status;
  const messageErrorStatus = (messages.error as { status?: number } | undefined)
    ?.status;
  const accessDenied = [accessErrorStatus, messageErrorStatus].some(
    (status) => status !== undefined && status >= 400 && status < 500,
  );
  if (access.revoked || accessDenied)
    return (
      <main className="mx-auto max-w-3xl p-6" role="alert">
        Your access to this conversation has ended.
      </main>
    );
  if (access.summary.error)
    return (
      <main className="mx-auto max-w-3xl p-6" role="alert">
        Could not check conversation access. Retry or refresh this page.
      </main>
    );
  if (!access.summary.data)
    return <main className="mx-auto max-w-3xl p-6">Checking access…</main>;
  const publisher = access.summary.data.participants.find(
    (participant) =>
      participant.memberId === access.summary.data?.publisherMemberId,
  );
  const available =
    messages.data?.status === "available" ? messages.data : undefined;
  const subject = available?.messages[0]?.subject;
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild size="xs-2" variant="ghostMuted" className="-ml-2">
          <Link href={`/shared?memberId=${encodeURIComponent(memberId)}`}>
            <ArrowLeftIcon className="mr-1.5 size-3.5" />
            Discussions
          </Link>
        </Button>
        <Tooltip content="Refresh email">
          <Button
            aria-label="Refresh email"
            onClick={() => messages.mutate()}
            size="iconXs"
            variant="ghostMuted"
          >
            <RefreshCwIcon
              className={cn(
                "size-3.5",
                messages.isValidating && "animate-spin",
              )}
            />
          </Button>
        </Tooltip>
      </div>
      <header className="space-y-1">
        <h1 className="font-semibold text-foreground text-xl">
          {subject || "Shared conversation"}
        </h1>
        {publisher && (
          <p className="text-muted-foreground text-sm">
            Shared by {publisher.name}
          </p>
        )}
      </header>
      <LoadingContent loading={messages.isLoading} error={messages.error}>
        {messages.data?.status === "unavailable" && (
          <p
            className="rounded-lg border border-dashed px-4 py-3 text-muted-foreground text-sm"
            role="status"
          >
            Email content is unavailable ({messages.data.reason}). Internal
            comments remain available.
          </p>
        )}
        {available && (
          <div className="space-y-3">
            {!available.complete && (
              <p className="text-muted-foreground text-xs" role="status">
                This email history is incomplete.
              </p>
            )}
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {available.messages.map((message) => (
                <SharedMessage
                  key={message.ref}
                  conversationId={conversationId}
                  message={message}
                />
              ))}
            </div>
          </div>
        )}
      </LoadingContent>
      <ConversationDiscussionView
        memberId={memberId}
        conversationId={conversationId}
        showSharedViewLink={false}
        discussion={access}
      />
    </main>
  );
}

function SharedMessage({
  conversationId,
  message,
}: {
  conversationId: string;
  message: Extract<
    TeamMessagesResponse,
    { status: "available" }
  >["messages"][number];
}) {
  const senderName =
    extractNameFromEmail(message.from) || extractEmailAddress(message.from);
  const recipients = formatRecipientNames(
    [
      ...splitRecipientList(message.to ?? ""),
      ...splitRecipientList(message.cc ?? ""),
    ],
    "",
  );
  return (
    <article className="min-w-0 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar aria-hidden className="size-7 shrink-0">
          <AvatarFallback className="bg-muted font-semibold text-[10px] text-muted-foreground tracking-wide">
            {getInitials(senderName)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate font-semibold text-foreground text-sm">
          {senderName}
        </span>
        {recipients && (
          <span className="hidden min-w-0 shrink-[999] truncate text-muted-foreground text-xs sm:block">
            to {recipients}
          </span>
        )}
        <time
          className="ml-auto shrink-0 whitespace-nowrap text-muted-foreground text-xs"
          dateTime={new Date(message.date).toISOString()}
        >
          {formatShortDate(new Date(message.date))}
        </time>
      </div>
      {/* Aligns the body with the sender's name rather than the avatar. */}
      <div className="min-w-0 pt-3 sm:pl-9">
        <SharedMessageBody
          messageId={`${conversationId}:${message.ref}`}
          html={message.html}
          text={message.text}
        />
        {message.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <a
                key={attachment.ref}
                href={attachment.url}
                className="flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted"
              >
                <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{attachment.filename}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

// The mail body iframe blocks same-origin images and its sanitizer drops blob:
// URLs, so inline images from the access-checked attachment route are loaded
// here and embedded as data: URLs.
function SharedMessageBody({
  messageId,
  html,
  text,
}: {
  messageId: string;
  html?: string | null;
  text?: string | null;
}) {
  const [inlineImages, setInlineImages] = useState<{
    html: string;
    sources: Record<string, string>;
  }>();

  useEffect(() => {
    const sources = getInlineImageSources(html);
    if (!html || !sources.length) return;
    const controller = new AbortController();
    loadInlineImages(sources, controller.signal).then((loaded) => {
      if (!controller.signal.aborted)
        setInlineImages({ html, sources: loaded });
    });
    return () => controller.abort();
  }, [html]);

  const resolvedHtml =
    html && inlineImages?.html === html
      ? replaceInlineImageSources(html, inlineImages.sources)
      : html;

  return (
    <MailMessageBody
      messageId={messageId}
      html={resolvedHtml}
      text={text}
      allowRemoteImages={false}
    />
  );
}

const INLINE_IMAGE_SOURCE =
  /src="(\/api\/team-comments\/conversations\/[^"/]+\/attachments\/[^"]+)"/g;

function getInlineImageSources(html: string | null | undefined) {
  if (!html) return [];
  return [
    ...new Set(Array.from(html.matchAll(INLINE_IMAGE_SOURCE), (m) => m[1])),
  ];
}

function replaceInlineImageSources(
  html: string,
  sources: Record<string, string>,
) {
  return html.replace(INLINE_IMAGE_SOURCE, (match, source: string) =>
    sources[source] ? `src="${sources[source]}"` : match,
  );
}

async function loadInlineImages(sources: string[], signal: AbortSignal) {
  const entries = await Promise.all(
    sources.map(async (source) => {
      try {
        const response = await fetch(source.replaceAll("&amp;", "&"), {
          signal,
        });
        if (!response.ok) return;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) return;
        return [source, await readAsDataUrl(blob)] as const;
      } catch {
        return;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== undefined));
}

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
