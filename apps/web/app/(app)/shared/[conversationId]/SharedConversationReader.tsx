"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { MailMessageBody } from "@inboxzero/mail-ui/MailBody";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import { ConversationDiscussionView } from "@/components/team-comments/ConversationDiscussion";
import { useConversationDiscussion } from "@/components/team-comments/use-conversation-discussion";
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
          Select your organization membership from{" "}
          <Link href="/shared" className="text-primary underline">
            Shared with me
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
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <Link href="/shared" className="text-primary text-sm underline">
          Shared with me
        </Link>
        <Button size="sm" variant="ghost" onClick={() => messages.mutate()}>
          Refresh email
        </Button>
      </div>
      <LoadingContent loading={messages.isLoading} error={messages.error}>
        {messages.data?.status === "unavailable" && (
          <div className="rounded-lg border p-4" role="status">
            Email content is unavailable ({messages.data.reason}). Internal
            comments remain available.
          </div>
        )}
        {messages.data?.status === "available" && (
          <div className="space-y-4">
            {!messages.data.complete && (
              <p className="text-amber-700 text-sm" role="status">
                This email history is incomplete.
              </p>
            )}
            {messages.data.messages.map((message) => (
              <article
                key={message.ref}
                className="min-w-0 space-y-3 rounded-lg border bg-card p-4"
              >
                <h1 className="font-title text-lg font-semibold">
                  {message.subject || "(no subject)"}
                </h1>
                <div className="text-muted-foreground text-xs">
                  <p>From: {message.from}</p>
                  <p>To: {message.to}</p>
                  {message.cc && <p>Cc: {message.cc}</p>}
                  <time dateTime={new Date(message.date).toISOString()}>
                    {new Date(message.date).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </div>
                <SharedMessageBody
                  messageId={`${conversationId}:${message.ref}`}
                  html={message.html}
                  text={message.text}
                />
                {message.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t pt-2">
                    {message.attachments.map((attachment) => (
                      <a
                        key={attachment.ref}
                        href={attachment.url}
                        className="text-primary text-sm underline"
                      >
                        {attachment.filename}
                      </a>
                    ))}
                  </div>
                )}
              </article>
            ))}
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
