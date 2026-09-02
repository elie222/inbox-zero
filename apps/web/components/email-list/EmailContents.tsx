import { startTransition, useMemo, useState, useRef, useEffect } from "react";
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
import {
  fetchAttachment,
  getAttachmentUrl,
} from "@/utils/attachments/download";
import { splitEmailContent } from "@/utils/email/split-email-content.client";

const SANS_FONT_STACK = `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const EMAIL_DOCUMENT_MARKER = "inbox-zero-email-document";
const NO_INLINE_ATTACHMENTS: ParsedMessage["inline"] = [];
/**
 * Reading size for a message body that brought no styling of its own. Shared by
 * both paths: Tailwind classes can't reach inside the iframe, so plain text has
 * to restate it or the two drift apart on screen.
 */
const BODY_TYPE = { fontSize: "14.5px", lineHeight: 1.65 } as const;

export function HtmlEmail({
  html,
  messageId,
  emailAccountId,
  inlineAttachments = NO_INLINE_ATTACHMENTS,
}: {
  html: string;
  messageId: string;
  emailAccountId?: string;
  inlineAttachments?: ParsedMessage["inline"];
}) {
  const sanitizedHtml = useMemo(() => sanitizeEmailHtml(html), [html]);
  const [showReplies, setShowReplies] = useState(false);
  const [renderHtml, setRenderHtml] = useState(
    () =>
      getPreparedEmailHtml({ messageId, sourceHtml: sanitizedHtml }) ??
      sanitizedHtml,
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    setRenderHtml(
      getPreparedEmailHtml({ messageId, sourceHtml: sanitizedHtml }) ??
        sanitizedHtml,
    );

    Promise.all([
      prepareSanitizedEmailHtml({ messageId, sourceHtml: sanitizedHtml }),
      loadInlineImageSources({
        emailAccountId,
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
      for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
    };
  }, [emailAccountId, inlineAttachments, messageId, sanitizedHtml]);

  const { mainContent, hasQuotedContent } = useMemo(
    () => splitEmailContent(renderHtml),
    [renderHtml],
  );

  const displayedHtml = showReplies ? renderHtml : mainContent;
  const documentKey = useMemo(
    () => getIframeDocumentKey(displayedHtml, isDarkMode),
    [displayedHtml, isDarkMode],
  );
  const srcDoc = useMemo(
    () =>
      getIframeHtml(
        displayedHtml,
        isDarkMode,
        IMAGE_PROXY_BASE_URL,
        IMAGE_PROXY_ORIGIN,
        documentKey,
      ),
    [displayedHtml, isDarkMode, documentKey],
  );

  const iframeHeight = useIframeHeight(iframeRef, srcDoc, documentKey);

  return (
    <div className="relative min-w-0 overflow-x-hidden">
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        className="min-h-0 w-full"
        style={iframeHeight ? { height: `${iframeHeight + 3}px` } : undefined}
        title="Email content preview"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
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
    </div>
  );
}

export function PlainEmail({ text }: { text: string }) {
  return (
    // `pre` keeps the sender's line breaks; the font stack keeps it readable.
    <pre
      className="whitespace-pre-wrap font-sans text-foreground"
      style={BODY_TYPE}
    >
      {decodeHtmlEntities(text)}
    </pre>
  );
}

function getIframeHtml(
  html: string,
  isDarkMode: boolean,
  imageProxyBaseUrl: string | null,
  imageProxyOrigin: string | null,
  documentKey: string,
) {
  // Count style attributes safely
  const styleAttributeCount = (html.match(/style=/g) || []).length;

  // Check for heavy styling that would indicate a rich HTML email
  const hasHeavyStyling =
    html.includes("bgcolor") ||
    html.includes("background") ||
    html.includes("<style") ||
    // Look for multiple style attributes or font styling
    styleAttributeCount > 1 ||
    html.includes("font-family") ||
    html.includes("font-size");

  // Check for basic text styling that shouldn't prevent dark mode
  const hasMinimalStyling =
    !hasHeavyStyling &&
    (html.includes("color:") ||
      html.includes("text-decoration") ||
      // Single style attribute is ok (probably just a link)
      styleAttributeCount === 1);

  const defaultFontStyles = hasHeavyStyling
    ? `
    <style>
      :root {
        color-scheme: light;
        background-color: white;
      }
      body {
        background-color: white;
        font-family: ${SANS_FONT_STACK};
      }
      table { max-width: 100% !important; overflow-x: auto; }
      img { max-width: 100% !important; height: auto; }
    </style>
  `
    : `
    <style>
      :root {
        color-scheme: light;
        --foreground: 222.2 47.4% 11.2%;
        --muted-foreground: 215.4 16.3% 46.9%;
        --background: 0 0% 100%;
      }

      .dark {
        color-scheme: dark;
        --foreground: 0 0% 98%;
        --muted-foreground: 240 5% 64.9%;
        --background: 240 10% 3.9%;
      }

      /* Contain wide content within the pane */
      table { max-width: 100% !important; overflow-x: auto; }
      img { max-width: 100% !important; height: auto; }

      /* Base styles - apply our font as a baseline; inline styles on inner elements still win */
      body {
        font-family: ${SANS_FONT_STACK};
      }
      body:not([style]):not([bgcolor]) {
        margin: 0;
        font-size: ${BODY_TYPE.fontSize};
        line-height: ${BODY_TYPE.lineHeight};
        color: hsl(var(--foreground));
        background-color: hsl(var(--background));
      }

      /* Only style unstyled blockquotes and quoted text */
      blockquote:not([style]), .gmail_quote:not([style]) {
        color: hsl(var(--muted-foreground));
        border-left: 3px solid hsl(var(--muted-foreground) / 0.2);
        margin: 0;
        padding-left: 1rem;
      }

      /* Style links - allow minimal styling to persist */
      a {
        color: ${hasMinimalStyling ? "inherit" : "hsl(var(--foreground))"};
        text-decoration: underline;
      }

      /* Only style unstyled quoted text */
      .gmail_quote:not([style]), .gmail_quote:not([style]) * {
        color: hsl(var(--muted-foreground));
      }

      /* Preserve colors for minimally styled elements */
      ${
        hasMinimalStyling
          ? `
      [style*="color"] {
        color: inherit !important;
      }
      `
          : ""
      }
    </style>
  `;

  // The server can fail closed to the original HTML when proxy signing is unavailable,
  // so only lock CSP to the proxy after the rendered markup actually points at it.
  const imageSourceDirective =
    imageProxyBaseUrl && imageProxyOrigin && html.includes(imageProxyBaseUrl)
      ? imageProxyOrigin
      : "https:";
  const localImageSourceDirective = html.includes("blob:")
    ? "data: blob:"
    : "data:";

  const securityHeaders = `
    <meta http-equiv="Content-Security-Policy" content="
      default-src 'none';
      style-src 'unsafe-inline';
      img-src ${localImageSourceDirective} ${imageSourceDirective};
      font-src 'none';
      media-src 'none';
      connect-src 'none';
      manifest-src 'none';
      prefetch-src 'none';
      worker-src 'none';
      child-src 'none';
      script-src 'none';
      frame-src 'none';
      object-src 'none';
      base-uri 'none';
      form-action 'none';
    ">
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
  `;

  const headContent = `<meta name="${EMAIL_DOCUMENT_MARKER}" content="${documentKey}">${securityHeaders}${defaultFontStyles}<base target="_blank" rel="noopener noreferrer">`;

  function wrapWithProperStructure(content: string) {
    if (content.indexOf("<html") === -1) {
      return `
        <html>
          <head>${headContent}</head>
          <body>${content}</body>
        </html>`;
    }

    if (content.indexOf("<head") === -1) {
      return content.replace(
        /<html([^>]*)>/i,
        `<html$1><head>${headContent}</head>`,
      );
    }

    return content.replace(/<head([^>]*)>/i, `<head$1>${headContent}`);
  }

  const htmlWithHead = wrapWithProperStructure(html);
  return addDarkModeClass(htmlWithHead, isDarkMode);
}

async function loadInlineImageSources({
  emailAccountId,
  html,
  inlineAttachments,
  messageId,
}: {
  emailAccountId?: string;
  html: string;
  inlineAttachments: ParsedMessage["inline"];
  messageId: string;
}): Promise<Record<string, string>> {
  if (!emailAccountId || !inlineAttachments.length) return {};

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
        const blob = await fetchAttachment({
          emailAccountId,
          url: getAttachmentUrl({
            messageId,
            attachmentId: attachment.attachmentId,
            mimeType: attachment.mimeType,
            filename: attachment.filename,
          }),
        });
        return [contentId, URL.createObjectURL(blob)] as const;
      } catch {
        return;
      }
    }),
  );

  return Object.fromEntries(entries.filter((entry) => entry !== undefined));
}

function addDarkModeClass(html: string, isDarkMode: boolean) {
  try {
    const darkClass = isDarkMode ? "dark" : "";

    // Handle empty or invalid HTML
    if (!html || typeof html !== "string") {
      return `<body class="${darkClass}"></body>`;
    }

    if (html.indexOf("<body") === -1) {
      return `<body class="${darkClass}">${html}</body>`;
    }

    return html.replace(/<body([^>]*)>/i, (match, attributes = "") => {
      try {
        const existingClass = attributes.match(/class=["']([^"']*)["']/);
        if (existingClass) {
          const combinedClass =
            `${existingClass[1].trim()} ${darkClass}`.trim();
          return match.replace(
            /class=["']([^"']*)["']/i,
            `class="${combinedClass}"`,
          );
        }
        return `<body${attributes} class="${darkClass}">`;
      } catch {
        // If regex matching fails, just add the class
        return `<body${attributes} class="${darkClass}">`;
      }
    });
  } catch {
    // If all else fails, return a safe fallback
    return `<body class="${isDarkMode ? "dark" : ""}"></body>`;
  }
}

function useIframeHeight(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  srcDoc: string,
  documentKey: string,
) {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let animationFrameId: number | undefined;
    let observedRoot: HTMLElement | null = null;

    const updateHeight = () => {
      const iframeDocument = iframe.contentDocument;
      if (!iframeDocument) return;
      const { body, documentElement } = iframeDocument;
      if (!body || !documentElement) return;

      const newHeight = Math.max(
        documentElement.scrollHeight,
        body.scrollHeight,
      );
      if (newHeight) setHeight(newHeight);
    };

    const resizeObserver = new ResizeObserver(updateHeight);

    const observeDocument = () => {
      if (iframe.srcdoc !== srcDoc) return false;
      const iframeDocument = iframe.contentDocument;
      if (!iframeDocument) return false;
      const marker = iframeDocument.querySelector(
        `meta[name="${EMAIL_DOCUMENT_MARKER}"]`,
      );
      if (marker?.getAttribute("content") !== documentKey) return false;
      const { body, documentElement: root } = iframeDocument;
      if (!body || !root) return false;
      if (root === observedRoot) return true;

      resizeObserver.disconnect();
      observedRoot = root;
      updateHeight();
      resizeObserver.observe(root);
      resizeObserver.observe(body);
      return true;
    };

    const stopWatchingForDocument = () => {
      if (animationFrameId === undefined) return;
      cancelAnimationFrame(animationFrameId);
      animationFrameId = undefined;
    };

    const watchForDocument = () => {
      if (observeDocument()) {
        animationFrameId = undefined;
        return;
      }
      animationFrameId = requestAnimationFrame(watchForDocument);
    };

    const onLoad = () => {
      if (!observeDocument()) return;
      updateHeight();
      stopWatchingForDocument();
    };

    iframe.addEventListener("load", onLoad);
    // `load` waits for remote images. Catch the `srcDoc` document swap first so
    // its parsed layout can be measured while those images are still loading.
    if (!observeDocument()) {
      animationFrameId = requestAnimationFrame(watchForDocument);
    }

    return () => {
      iframe.removeEventListener("load", onLoad);
      stopWatchingForDocument();
      resizeObserver.disconnect();
    };
  }, [iframeRef, srcDoc, documentKey]);

  return height;
}

function getIframeDocumentKey(html: string, isDarkMode: boolean) {
  const source = `${isDarkMode ? "1" : "0"}:${html}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${source.length}-${(hash >>> 0).toString(36)}`;
}
