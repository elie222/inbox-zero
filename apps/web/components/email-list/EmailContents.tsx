import { useOpenedConversationAttachments } from "./OpenedConversationAttachments";
import { startTransition, useEffect, useMemo, useState } from "react";
import {
  BufferedMailHtmlFrame,
  MailPlainTextBody,
  buildMailHtmlDocument,
  getMailHtmlDocumentKey,
  shouldApplyDarkMailTheme,
} from "@inboxzero/mail-ui/MailBody";
import { useTheme } from "next-themes";
import { EllipsisIcon } from "lucide-react";
import { decodeHtmlEntities } from "@/utils/gmail/decode";
import {
  getPreparedEmailHtml,
  IMAGE_PROXY_BASE_URL,
  IMAGE_PROXY_ORIGIN,
  prepareSanitizedEmailHtml,
  sanitizeEmailHtml,
} from "@/utils/email/prepare-html.client";
import type { ParsedMessage } from "@/utils/types";
import {
  getInlineImageContentIds,
  normalizeContentId,
  rewriteInlineImageSources,
} from "@/utils/email/inline-images";
import { linkifyPlainText } from "@/utils/email/linkify-plain-text";
import { splitEmailContent } from "@/utils/email/split-email-content.client";

const NO_INLINE_ATTACHMENTS: ParsedMessage["inline"] = [];

export function HtmlEmail({
  html,
  messageId,
  emailAccountId,
  inlineAttachments = NO_INLINE_ATTACHMENTS,
  onReplyMessage,
  onForwardMessage,
  onNavigateMessage,
  onFocusMessage,
}: {
  html: string;
  messageId: string;
  emailAccountId?: string;
  inlineAttachments?: ParsedMessage["inline"];
  onReplyMessage?: () => void;
  onForwardMessage?: () => void;
  onNavigateMessage?: (direction: -1 | 1) => void;
  onFocusMessage?: () => void;
}) {
  const attachmentSession = useOpenedConversationAttachments();
  const sanitizedHtml = useMemo(() => sanitizeEmailHtml(html), [html]);
  const [showReplies, setShowReplies] = useState(false);
  const [renderHtml, setRenderHtml] = useState(
    () =>
      getPreparedEmailHtml({ messageId, sourceHtml: sanitizedHtml }) ??
      sanitizedHtml,
  );
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const objectUrls: string[] = [];
    setRenderHtml(
      getPreparedEmailHtml({ messageId, sourceHtml: sanitizedHtml }) ??
        sanitizedHtml,
    );

    Promise.all([
      prepareSanitizedEmailHtml({ messageId, sourceHtml: sanitizedHtml }),
      loadInlineImageSources({
        session: emailAccountId ? attachmentSession : undefined,
        signal: controller.signal,
        html: sanitizedHtml,
        inlineAttachments,
        messageId,
      }),
    ]).then(
      ([rewrittenHtml, inlineImages]) => {
        const loadedObjectUrls = Object.values(inlineImages);
        if (cancelled) {
          for (const objectUrl of loadedObjectUrls) {
            URL.revokeObjectURL(objectUrl);
          }
          return;
        }
        objectUrls.push(...loadedObjectUrls);
        startTransition(() =>
          setRenderHtml(rewriteInlineImageSources(rewrittenHtml, inlineImages)),
        );
      },
      () => {
        if (cancelled) return;
        startTransition(() => setRenderHtml(sanitizedHtml));
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
      for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
    };
  }, [
    emailAccountId,
    attachmentSession,
    inlineAttachments,
    messageId,
    sanitizedHtml,
  ]);

  const { mainContent, quotedContent, hasQuotedContent } = useMemo(
    () => splitEmailContent(renderHtml),
    [renderHtml],
  );
  const applyDarkTheme = shouldApplyDarkMailTheme(mainContent, isDarkMode);
  const applyQuotedDarkTheme = shouldApplyDarkMailTheme(
    quotedContent,
    isDarkMode,
  );

  const documentKey = useMemo(
    () => getMailHtmlDocumentKey(mainContent, applyDarkTheme),
    [mainContent, applyDarkTheme],
  );
  const srcDoc = useMemo(
    () =>
      buildMailHtmlDocument({
        html: mainContent,
        isDarkMode: applyDarkTheme,
        imageProxyBaseUrl: IMAGE_PROXY_BASE_URL,
        imageProxyOrigin: IMAGE_PROXY_ORIGIN,
        documentKey,
      }),
    [mainContent, applyDarkTheme, documentKey],
  );

  const quotedDocumentKey = useMemo(
    () => getMailHtmlDocumentKey(quotedContent, applyQuotedDarkTheme),
    [quotedContent, applyQuotedDarkTheme],
  );
  const quotedSrcDoc = useMemo(
    () =>
      buildMailHtmlDocument({
        html: quotedContent,
        isDarkMode: applyQuotedDarkTheme,
        imageProxyBaseUrl: IMAGE_PROXY_BASE_URL,
        imageProxyOrigin: IMAGE_PROXY_ORIGIN,
        documentKey: quotedDocumentKey,
      }),
    [quotedContent, applyQuotedDarkTheme, quotedDocumentKey],
  );
  const callbacks = {
    onForwardMessage,
    onNavigateMessage,
    onReplyMessage,
    onFocusMessage,
  };

  return (
    <div className="relative min-w-0 overflow-x-hidden">
      <BufferedMailHtmlFrame
        srcDoc={srcDoc}
        documentKey={documentKey}
        isDarkMode={applyDarkTheme}
        callbacks={callbacks}
      />
      {hasQuotedContent && (
        <button
          type="button"
          aria-expanded={showReplies}
          aria-label={
            showReplies ? "Hide quoted content" : "Show quoted content"
          }
          className="mt-1 inline-flex h-5 items-center rounded-full bg-muted px-2 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          onClick={() => setShowReplies(!showReplies)}
        >
          <EllipsisIcon className="size-4" />
        </button>
      )}
      {hasQuotedContent && showReplies && (
        <BufferedMailHtmlFrame
          srcDoc={quotedSrcDoc}
          documentKey={quotedDocumentKey}
          isDarkMode={applyQuotedDarkTheme}
          callbacks={callbacks}
        />
      )}
    </div>
  );
}

export function PlainEmail({ text }: { text: string }) {
  const segments = useMemo(
    () => linkifyPlainText(decodeHtmlEntities(text)),
    [text],
  );

  return <MailPlainTextBody segments={segments} />;
}

async function loadInlineImageSources({
  session,
  signal,
  html,
  inlineAttachments,
  messageId,
}: {
  session: ReturnType<typeof useOpenedConversationAttachments>;
  signal: AbortSignal;
  html: string;
  inlineAttachments: ParsedMessage["inline"];
  messageId: string;
}): Promise<Record<string, string>> {
  if (!session || !inlineAttachments.length) return {};

  const attachmentByContentId = new Map<
    string,
    ParsedMessage["inline"][number]
  >();
  for (const attachment of inlineAttachments) {
    const contentId = normalizeContentId(attachment.headers["content-id"]);
    if (contentId) attachmentByContentId.set(contentId, attachment);
  }

  const entries = await Promise.all(
    getInlineImageContentIds(html).map(async (contentId) => {
      const attachment = attachmentByContentId.get(contentId);
      if (!attachment?.attachmentId) return;

      try {
        const blob = await session.load(
          messageId,
          attachment.attachmentId,
          signal,
          attachment,
        );
        if (!blob || signal.aborted) return;
        return [contentId, URL.createObjectURL(blob)] as const;
      } catch {
        return;
      }
    }),
  );

  return Object.fromEntries(entries.filter((entry) => entry !== undefined));
}
