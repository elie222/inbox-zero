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
} from "@inboxzero/mail-ui/inline-images";
import { linkifyPlainText } from "@inboxzero/mail-ui/linkify";
import { splitEmailContent } from "@/utils/email/split-email-content.client";
import {
  fetchAttachment,
  getAttachmentUrl,
} from "@/utils/attachments/download";
import { queueAttachmentDownload } from "@/utils/attachments/download-queue";
import { getAttachmentImagePreview } from "@inboxzero/mail-ui/image-preview";
import {
  getLoadedInlineImages,
  inlineImageCacheKey,
  retainInlineImages,
  storeLoadedInlineImage,
  withLoadedInlineImages,
} from "@/utils/email/inline-image-cache";

const NO_INLINE_ATTACHMENTS: ParsedMessage["inline"] = [];
const INLINE_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

export function HtmlEmail({
  html,
  messageId,
  emailAccountId,
  inlineAttachments = NO_INLINE_ATTACHMENTS,
  sendOperationId,
  onReplyMessage,
  onForwardMessage,
  onNavigateMessage,
  onFocusMessage,
}: {
  html: string;
  messageId: string;
  emailAccountId?: string;
  inlineAttachments?: ParsedMessage["inline"];
  sendOperationId?: string;
  onReplyMessage?: (quote?: string) => void;
  onForwardMessage?: () => void;
  onNavigateMessage?: (direction: -1 | 1) => void;
  onFocusMessage?: () => void;
}) {
  const cacheKey = inlineImageCacheKey(
    emailAccountId,
    messageId,
    sendOperationId,
  );
  const sanitizedHtml = useMemo(() => sanitizeEmailHtml(html), [html]);
  // Message objects are rebuilt whenever the conversation republishes, so the
  // effect keys on the attachments' identity rather than the array or its
  // order. Re-running it would mint new object URLs and remount the frame
  // without its images.
  const inlineImageIds = useMemo(
    () => serializeInlineImageIds(inlineAttachments),
    [inlineAttachments],
  );
  const [showReplies, setShowReplies] = useState(false);
  const [renderHtml, setRenderHtml] = useState(() =>
    getInitialRenderHtml({ messageId, cacheKey, sanitizedHtml }),
  );
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  useEffect(() => retainInlineImages(cacheKey), [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const initialHtml = getInitialRenderHtml({
      messageId,
      cacheKey,
      sanitizedHtml,
    });
    // A sent reply keeps its row when it syncs under a new id. Clearing the
    // body while that id's html is prepared would blank the message.
    if (initialHtml !== null) setRenderHtml(initialHtml);

    const preparedHtml = prepareSanitizedEmailHtml({
      messageId,
      sourceHtml: sanitizedHtml,
    });
    // Inline images download separately so a slow attachment doesn't hold
    // back the body.
    preparedHtml.then((html) => {
      if (!cancelled)
        startTransition(() =>
          setRenderHtml(withLoadedInlineImages(cacheKey, html)),
        );
    });
    Promise.all([
      preparedHtml,
      loadInlineImageSources({
        emailAccountId,
        signal: controller.signal,
        html: sanitizedHtml,
        inlineImageIds,
        messageId,
        cacheKey,
      }),
    ]).then(
      ([rewrittenHtml, loadedNewImages]) => {
        if (cancelled || !loadedNewImages) return;
        startTransition(() =>
          setRenderHtml(withLoadedInlineImages(cacheKey, rewrittenHtml)),
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
    };
  }, [cacheKey, emailAccountId, inlineImageIds, messageId, sanitizedHtml]);

  const { mainContent, quotedContent, hasQuotedContent } = useMemo(
    () => splitEmailContent(renderHtml ?? ""),
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

  if (renderHtml === null) return <div data-email-ready="false" />;

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

// Showing the original html first would load remote images directly and then
// reload them all through the proxy, so the body waits for the proxied html.
function getInitialRenderHtml({
  messageId,
  cacheKey,
  sanitizedHtml,
}: {
  messageId: string;
  cacheKey: string;
  sanitizedHtml: string;
}) {
  const preparedHtml = IMAGE_PROXY_BASE_URL
    ? getPreparedEmailHtml({ messageId, sourceHtml: sanitizedHtml })
    : sanitizedHtml;
  if (preparedHtml === undefined) return null;
  return withLoadedInlineImages(cacheKey, preparedHtml);
}

async function loadInlineImageSources({
  emailAccountId,
  signal,
  html,
  inlineImageIds,
  messageId,
  cacheKey,
}: {
  emailAccountId: string | undefined;
  signal: AbortSignal;
  html: string;
  inlineImageIds: string;
  messageId: string;
  cacheKey: string;
}): Promise<boolean> {
  const attachmentIdByContentId = new Map<string, string>(
    JSON.parse(inlineImageIds),
  );
  if (!emailAccountId || !attachmentIdByContentId.size) return false;
  const loadedSources = getLoadedInlineImages(cacheKey);

  const loaded = await Promise.all(
    getInlineImageContentIds(html).map(async (contentId) => {
      const attachmentId = attachmentIdByContentId.get(contentId);
      if (!attachmentId || loadedSources?.[contentId]) return false;

      try {
        // Body images are content the user opened, so they skip the
        // speculative attachment-preview budget.
        const blob = await queueAttachmentDownload({
          priority: "requested",
          signal,
          download: (transferSignal) =>
            fetchAttachment({
              url: getAttachmentUrl({
                accountId: emailAccountId,
                messageId,
                attachmentId,
              }),
              emailAccountId,
              maxBytes: INLINE_IMAGE_MAX_BYTES,
              signal: transferSignal,
            }),
        }).then(getAttachmentImagePreview);
        if (!blob || signal.aborted) return false;
        storeLoadedInlineImage({
          messageId: cacheKey,
          contentId,
          objectUrl: URL.createObjectURL(blob),
        });
        return true;
      } catch {
        return false;
      }
    }),
  );

  return loaded.some(Boolean);
}

function serializeInlineImageIds(inlineAttachments: ParsedMessage["inline"]) {
  const entries: [contentId: string, attachmentId: string][] = [];
  for (const attachment of inlineAttachments) {
    const contentId = normalizeContentId(attachment.headers["content-id"]);
    if (contentId && attachment.attachmentId)
      entries.push([contentId, attachment.attachmentId]);
  }
  return JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)));
}
