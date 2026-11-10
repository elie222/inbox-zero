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
  needsImageProxy,
  prepareEmailImages,
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
  const [rendered, setRendered] = useState(() =>
    getInitialRender({ messageId, cacheKey, sanitizedHtml }),
  );
  const renderHtml = rendered.html;
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  useEffect(() => retainInlineImages(cacheKey), [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const initial = getInitialRender({ messageId, cacheKey, sanitizedHtml });
    // A sent reply keeps its row when it syncs under a new id. Showing that
    // id's html with its images held back would blank them in the message.
    if (initial.images !== "pending") setRendered(initial);
    const show = ({ html, remoteImagesAllowed }: PreparedImages) =>
      startTransition(() =>
        setRendered({
          html: withLoadedInlineImages(cacheKey, html),
          images: remoteImagesAllowed ? "allowed" : "blocked",
        }),
      );

    const preparedHtml = prepareEmailImages({
      messageId,
      sourceHtml: sanitizedHtml,
    });
    // Inline images download separately so a slow attachment doesn't hold
    // back the body.
    preparedHtml.then((prepared) => {
      if (!cancelled) show(prepared);
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
      ([prepared, loadedNewImages]) => {
        if (cancelled || !loadedNewImages) return;
        show(prepared);
      },
      () => {
        if (cancelled) return;
        show({ html: sanitizedHtml, remoteImagesAllowed: false });
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cacheKey, emailAccountId, inlineImageIds, messageId, sanitizedHtml]);

  const { mainContent, quotedContent, hasQuotedContent } = useMemo(
    () => splitEmailContent(renderHtml),
    [renderHtml],
  );
  // The proxied document replaces this one, so the key must change with it
  // even when the proxy leaves the html as it was.
  const imageModeKey = `${rendered.images}:`;
  const applyDarkTheme = shouldApplyDarkMailTheme(mainContent, isDarkMode);
  const applyQuotedDarkTheme = shouldApplyDarkMailTheme(
    quotedContent,
    isDarkMode,
  );

  const documentKey = useMemo(
    () => getMailHtmlDocumentKey(imageModeKey + mainContent, applyDarkTheme),
    [imageModeKey, mainContent, applyDarkTheme],
  );
  const srcDoc = useMemo(
    () =>
      buildMailHtmlDocument({
        html: mainContent,
        isDarkMode: applyDarkTheme,
        imageProxyBaseUrl: IMAGE_PROXY_BASE_URL,
        imageProxyOrigin: IMAGE_PROXY_ORIGIN,
        documentKey,
        allowRemoteImages: rendered.images === "allowed",
        remoteImagesPending: rendered.images === "pending",
      }),
    [mainContent, applyDarkTheme, documentKey, rendered.images],
  );

  const quotedDocumentKey = useMemo(
    () =>
      getMailHtmlDocumentKey(
        imageModeKey + quotedContent,
        applyQuotedDarkTheme,
      ),
    [imageModeKey, quotedContent, applyQuotedDarkTheme],
  );
  const quotedSrcDoc = useMemo(
    () =>
      buildMailHtmlDocument({
        html: quotedContent,
        isDarkMode: applyQuotedDarkTheme,
        imageProxyBaseUrl: IMAGE_PROXY_BASE_URL,
        imageProxyOrigin: IMAGE_PROXY_ORIGIN,
        documentKey: quotedDocumentKey,
        allowRemoteImages: rendered.images === "allowed",
        remoteImagesPending: rendered.images === "pending",
      }),
    [quotedContent, applyQuotedDarkTheme, quotedDocumentKey, rendered.images],
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

/**
 * What to show before any preparation finishes. Html with remote images is
 * shown straight away with those images held back; the proxied document then
 * replaces it, so the reader never waits on the proxy to see the text.
 */
function getInitialRender({
  messageId,
  cacheKey,
  sanitizedHtml,
}: {
  messageId: string;
  cacheKey: string;
  sanitizedHtml: string;
}): { html: string; images: RemoteImageMode } {
  // Html that needs no proxy loads remote images only when there is no proxy
  // at all; with one, remote loads stay blocked in case the check missed one.
  const images = IMAGE_PROXY_BASE_URL ? "blocked" : "allowed";
  if (!needsImageProxy(sanitizedHtml))
    return { html: withLoadedInlineImages(cacheKey, sanitizedHtml), images };
  const preparedHtml = getPreparedEmailHtml({
    messageId,
    sourceHtml: sanitizedHtml,
  });
  if (preparedHtml === undefined)
    return {
      html: withLoadedInlineImages(cacheKey, sanitizedHtml),
      images: "pending",
    };
  return {
    html: withLoadedInlineImages(cacheKey, preparedHtml),
    images: "allowed",
  };
}

type RemoteImageMode = "allowed" | "blocked" | "pending";
type PreparedImages = Awaited<ReturnType<typeof prepareEmailImages>>;

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
