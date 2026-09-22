import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { sanitizeMailHtml } from "./sanitize-html";

const SANS_FONT_STACK = `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const BODY_TYPE = { fontSize: "14.5px", lineHeight: 1.65 } as const;

export const EMAIL_DOCUMENT_MARKER = "inbox-zero-email-document";

export type MailPlainTextSegment =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

export type MailHtmlFrameCallbacks = {
  onForwardMessage?: () => void;
  onReplyMessage?: () => void;
  onNavigateMessage?: (direction: -1 | 1) => void;
  onFocusMessage?: () => void;
};

type MailHtmlDocument = {
  srcDoc: string;
  documentKey: string;
};

export function MailMessageBody({
  html,
  text,
  messageId,
  isDarkMode = false,
  imageProxyBaseUrl = null,
  imageProxyOrigin = null,
  allowRemoteImages = false,
}: {
  html?: string | null;
  text?: string | null;
  messageId: string;
  isDarkMode?: boolean;
  imageProxyBaseUrl?: string | null;
  imageProxyOrigin?: string | null;
  allowRemoteImages?: boolean;
}) {
  const document = useMemo(() => {
    if (!html) return null;
    const sanitizedHtml = sanitizeMailHtml(html);
    const applyDarkTheme = shouldApplyDarkMailTheme(sanitizedHtml, isDarkMode);
    const documentKey = getMailHtmlDocumentKey(
      `${messageId}:${sanitizedHtml}`,
      applyDarkTheme,
    );
    return {
      documentKey,
      isDarkMode: applyDarkTheme,
      srcDoc: buildMailHtmlDocument({
        html: sanitizedHtml,
        isDarkMode: applyDarkTheme,
        imageProxyBaseUrl,
        imageProxyOrigin,
        documentKey,
        allowRemoteImages,
      }),
    };
  }, [
    allowRemoteImages,
    html,
    imageProxyBaseUrl,
    imageProxyOrigin,
    isDarkMode,
    messageId,
  ]);

  if (document) {
    return (
      <div className="relative min-w-0 overflow-x-hidden">
        <BufferedMailHtmlFrame
          callbacks={{}}
          documentKey={document.documentKey}
          isDarkMode={document.isDarkMode}
          srcDoc={document.srcDoc}
        />
      </div>
    );
  }

  return <MailPlainTextBody segments={[{ type: "text", text: text ?? "" }]} />;
}

export function MailPlainTextBody({
  segments,
  className,
}: {
  segments: MailPlainTextSegment[];
  className?: string;
}) {
  return (
    <pre
      className={[
        "whitespace-pre-wrap font-sans text-foreground [overflow-wrap:anywhere]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={BODY_TYPE}
    >
      {segments.map((segment, index) =>
        segment.type === "link" ? (
          <a
            className="text-primary underline underline-offset-2"
            href={segment.href}
            key={`${segment.href}-${index}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {segment.text}
          </a>
        ) : (
          <Fragment key={`${index}-${segment.text}`}>{segment.text}</Fragment>
        ),
      )}
    </pre>
  );
}

export function BufferedMailHtmlFrame({
  srcDoc,
  documentKey,
  isDarkMode,
  callbacks,
}: MailHtmlDocument & {
  isDarkMode: boolean;
  callbacks: MailHtmlFrameCallbacks;
}) {
  const [visibleDocument, setVisibleDocument] = useState<MailHtmlDocument>(
    () => ({
      srcDoc,
      documentKey,
    }),
  );
  const nextDocument = useMemo(
    () => ({ srcDoc, documentKey }),
    [srcDoc, documentKey],
  );
  const documents =
    visibleDocument.documentKey !== documentKey
      ? [visibleDocument, nextDocument]
      : [nextDocument];

  return (
    <div className="relative min-w-0">
      {documents.map((document, index) => (
        <MailHtmlFrame
          key={document.documentKey}
          document={document}
          pending={index > 0}
          isDarkMode={isDarkMode}
          onReady={setVisibleDocument}
          callbacks={callbacks}
        />
      ))}
    </div>
  );
}

export function buildMailHtmlDocument({
  html,
  isDarkMode,
  imageProxyBaseUrl,
  imageProxyOrigin,
  documentKey,
  allowRemoteImages = true,
}: {
  html: string;
  isDarkMode: boolean;
  imageProxyBaseUrl: string | null;
  imageProxyOrigin: string | null;
  documentKey: string;
  allowRemoteImages?: boolean;
}) {
  const styleAttributeCount = (html.match(/style=/gi) || []).length;
  const hasHeavyStyling = isDesignedHtmlEmail(html);

  const hasMinimalStyling =
    !hasHeavyStyling &&
    (html.includes("color:") ||
      html.includes("text-decoration") ||
      styleAttributeCount === 1);

  const defaultFontCss = hasHeavyStyling
    ? `
      :root {
        color-scheme: light;
        background-color: white;
      }
      body {
        background-color: white;
        font-family: ${SANS_FONT_STACK};
        overflow-wrap: anywhere;
      }
      table { max-width: 100% !important; overflow-x: auto; }
      img { max-width: 100% !important; height: auto; }
  `
    : `
      :root {
        color-scheme: light;
        --foreground: 222.2 47.4% 11.2%;
        --muted-foreground: 215.4 16.3% 46.9%;
        --background: 0 0% 100%;
        background-color: hsl(var(--background));
      }

      .dark {
        color-scheme: dark;
        --foreground: 220 8% 92%;
        --muted-foreground: 220 5% 62%;
        --background: 220 7% 19%;
      }

      table { max-width: 100% !important; overflow-x: auto; }
      img { max-width: 100% !important; height: auto; }

      body {
        font-family: ${SANS_FONT_STACK};
        overflow-wrap: anywhere;
      }
      body:not([style]):not([bgcolor]) {
        margin: 0;
        font-size: ${BODY_TYPE.fontSize};
        line-height: ${BODY_TYPE.lineHeight};
        color: hsl(var(--foreground));
        background-color: hsl(var(--background));
      }

      blockquote:not([style]), .gmail_quote:not([style]) {
        color: hsl(var(--muted-foreground));
        border-left: 3px solid hsl(var(--muted-foreground) / 0.2);
        margin: 0;
        padding-left: 1rem;
      }

      a {
        color: ${hasMinimalStyling ? "inherit" : "hsl(var(--foreground))"};
        text-decoration: underline;
      }

      .gmail_quote:not([style]), .gmail_quote:not([style]) * {
        color: hsl(var(--muted-foreground));
      }

      ${
        hasMinimalStyling
          ? `
      [style*="color"] {
        color: inherit !important;
      }
      `
          : ""
      }
  `;

  const imageSourceDirective =
    imageProxyBaseUrl && imageProxyOrigin && html.includes(imageProxyBaseUrl)
      ? imageProxyOrigin
      : allowRemoteImages
        ? "https:"
        : "";
  const localImageSourceDirective = html.includes("blob:")
    ? "data: blob:"
    : "data:";
  const imageSourceDirectives = [
    localImageSourceDirective,
    imageSourceDirective,
  ]
    .filter(Boolean)
    .join(" ");

  const contentSecurityPolicy = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src ${imageSourceDirectives}`,
    "font-src 'none'",
    "media-src 'none'",
    "connect-src 'none'",
    "manifest-src 'none'",
    "prefetch-src 'none'",
    "worker-src 'none'",
    "child-src 'none'",
    "script-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  return buildStructuredMailHtmlDocument({
    html,
    isDarkMode,
    documentKey,
    contentSecurityPolicy,
    defaultFontCss,
    shouldDisableAuthoredDarkColorScheme: hasHeavyStyling,
  });
}

export function shouldApplyDarkMailTheme(html: string, isDarkMode: boolean) {
  return isDarkMode && !isDesignedHtmlEmail(html);
}

export function getMailHtmlDocumentKey(html: string, isDarkMode: boolean) {
  const source = `${isDarkMode ? "1" : "0"}:${html}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${source.length}-${(hash >>> 0).toString(36)}`;
}

function MailHtmlFrame({
  document,
  pending,
  isDarkMode,
  onReady,
  callbacks,
}: {
  document: MailHtmlDocument;
  pending: boolean;
  isDarkMode: boolean;
  onReady: (document: MailHtmlDocument) => void;
  callbacks: MailHtmlFrameCallbacks;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const height = useMailHtmlFrame(
    iframeRef,
    document.srcDoc,
    document.documentKey,
    callbacks,
  );
  useLayoutEffect(() => {
    if (height) onReady(document);
  }, [document, height, onReady]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={document.srcDoc}
      className="min-h-0 w-full"
      data-email-ready={height > 0}
      height={1}
      style={{
        height: height ? `${height}px` : undefined,
        position: pending ? "absolute" : undefined,
        top: pending ? 0 : undefined,
        visibility: pending ? "hidden" : undefined,
        colorScheme: isDarkMode ? "dark" : "light",
      }}
      aria-hidden={pending || undefined}
      title={
        pending ? "Preparing email content preview" : "Email content preview"
      }
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
    />
  );
}

function useMailHtmlFrame(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  srcDoc: string,
  documentKey: string,
  callbacks: MailHtmlFrameCallbacks,
) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const [measurement, setMeasurement] = useState<{
    documentKey: string;
    height: number;
  }>();

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let animationFrameId: number | undefined;
    let observedRoot: HTMLElement | null = null;
    let observedDocument: Document | null = null;

    const selectMessage = () => callbacksRef.current.onFocusMessage?.();
    const navigateMessage = (event: KeyboardEvent) => {
      const navigate = callbacksRef.current.onNavigateMessage;
      const reply = callbacksRef.current.onReplyMessage;
      const forward = callbacksRef.current.onForwardMessage;
      const key = event.key.toLowerCase();
      const isNavigationKey = ["ArrowUp", "ArrowDown"].includes(event.key);
      const handlesKey =
        (event.key === "Enter" && Boolean(reply)) ||
        (key === "f" && Boolean(forward)) ||
        (isNavigationKey && Boolean(navigate));
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.isComposing ||
        observedDocument?.getSelection()?.isCollapsed === false
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest?.(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
        )
      )
        return;
      if (event.key === "Enter" && target?.closest?.("a, button")) return;
      if (!handlesKey) {
        forwardShortcut(event);
        return;
      }
      event.preventDefault();
      if (event.key === "Enter") reply?.();
      else if (key === "f") forward?.();
      else navigate?.(event.key === "ArrowUp" ? -1 : 1);
    };
    const forwardShortcut = (event: KeyboardEvent) => {
      const forwarded = new KeyboardEvent(event.type, {
        key: event.key,
        code: event.code,
        location: event.location,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isComposing: event.isComposing,
        repeat: event.repeat,
        bubbles: true,
        cancelable: true,
      });
      if (!iframe.dispatchEvent(forwarded)) event.preventDefault();
    };
    const stopObservingDocument = () => {
      observedDocument?.removeEventListener("keydown", navigateMessage);
      observedDocument?.removeEventListener("keyup", forwardShortcut);
      observedDocument?.removeEventListener("pointerdown", selectMessage);
      observedDocument?.removeEventListener("focusin", selectMessage);
    };

    const updateHeight = () => {
      const iframeDocument = iframe.contentDocument;
      if (!iframeDocument) return;
      const { body, documentElement } = iframeDocument;
      if (!body || !documentElement) return;

      const newHeight = Math.max(
        documentElement.scrollHeight,
        body.scrollHeight,
      );
      if (newHeight) setMeasurement({ documentKey, height: newHeight });
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
      stopObservingDocument();
      observedDocument = iframeDocument;
      observedDocument.addEventListener("keydown", navigateMessage);
      observedDocument.addEventListener("keyup", forwardShortcut);
      observedDocument.addEventListener("pointerdown", selectMessage);
      observedDocument.addEventListener("focusin", selectMessage);
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
    if (!observeDocument()) {
      animationFrameId = requestAnimationFrame(watchForDocument);
    }

    return () => {
      iframe.removeEventListener("load", onLoad);
      stopWatchingForDocument();
      resizeObserver.disconnect();
      stopObservingDocument();
    };
  }, [iframeRef, srcDoc, documentKey]);

  return measurement?.documentKey === documentKey ? measurement.height : 0;
}

function isDesignedHtmlEmail(html: string) {
  const markup = html.toLowerCase();
  const styleAttributeCount = (markup.match(/style=/g) || []).length;
  return (
    markup.includes("bgcolor") ||
    markup.includes("background") ||
    markup.includes("<style") ||
    styleAttributeCount > 1 ||
    markup.includes("font-family") ||
    markup.includes("font-size")
  );
}

type StructuredMailHtmlDocumentInput = {
  html: string;
  isDarkMode: boolean;
  documentKey: string;
  contentSecurityPolicy: string;
  defaultFontCss: string;
  shouldDisableAuthoredDarkColorScheme: boolean;
};

function buildStructuredMailHtmlDocument({
  html,
  isDarkMode,
  documentKey,
  contentSecurityPolicy,
  defaultFontCss,
  shouldDisableAuthoredDarkColorScheme,
}: StructuredMailHtmlDocumentInput) {
  const mailDocument = new DOMParser().parseFromString(html || "", "text/html");

  if (shouldDisableAuthoredDarkColorScheme) {
    disableAuthoredDarkColorScheme(mailDocument);
  }

  prependMailDocumentHead(mailDocument, {
    documentKey,
    isDarkMode,
    contentSecurityPolicy,
    defaultFontCss,
  });
  applyDarkModeClass(mailDocument, isDarkMode);

  return `<!doctype html>
${mailDocument.documentElement.outerHTML}`;
}

function disableAuthoredDarkColorScheme(mailDocument: Document) {
  for (const stylesheet of mailDocument.querySelectorAll("style")) {
    stylesheet.textContent = (stylesheet.textContent ?? "").replace(
      /prefers-color-scheme\s*:\s*dark/gi,
      "prefers-color-scheme: inbox-zero-authored",
    );
  }
}

function prependMailDocumentHead(
  mailDocument: Document,
  {
    documentKey,
    isDarkMode,
    contentSecurityPolicy,
    defaultFontCss,
  }: {
    documentKey: string;
    isDarkMode: boolean;
    contentSecurityPolicy: string;
    defaultFontCss: string;
  },
) {
  const marker = mailDocument.createElement("meta");
  marker.name = EMAIL_DOCUMENT_MARKER;
  marker.content = documentKey;

  const colorScheme = mailDocument.createElement("meta");
  colorScheme.name = "color-scheme";
  colorScheme.content = isDarkMode ? "dark" : "light";

  const csp = mailDocument.createElement("meta");
  csp.httpEquiv = "Content-Security-Policy";
  csp.content = contentSecurityPolicy;

  const contentTypeOptions = mailDocument.createElement("meta");
  contentTypeOptions.httpEquiv = "X-Content-Type-Options";
  contentTypeOptions.content = "nosniff";

  const defaultStyles = mailDocument.createElement("style");
  defaultStyles.textContent = defaultFontCss;

  const base = mailDocument.createElement("base");
  base.target = "_blank";
  base.setAttribute("rel", "noopener noreferrer");

  mailDocument.head.prepend(
    marker,
    colorScheme,
    csp,
    contentTypeOptions,
    defaultStyles,
    base,
  );
}

function applyDarkModeClass(mailDocument: Document, isDarkMode: boolean) {
  if (!isDarkMode) return;

  mailDocument.documentElement.classList.add("dark");
  mailDocument.body.classList.add("dark");
}
