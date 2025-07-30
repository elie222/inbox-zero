import { useMemo, useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import DOMPurify from "dompurify";

export function HtmlEmail({ html }: { html: string }) {
  const [showReplies, setShowReplies] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  const sanitizedHtml = useMemo(() => sanitize(html), [html]);
  const { mainContent, hasReplies } = useMemo(
    () => getEmailContent(sanitizedHtml),
    [sanitizedHtml],
  );

  const srcDoc = useMemo(
    () => getIframeHtml(showReplies ? sanitizedHtml : mainContent, isDarkMode),
    [sanitizedHtml, mainContent, showReplies, isDarkMode],
  );

  const iframeHeight = useIframeHeight(iframeRef);

  return (
    <div className="relative">
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        className="min-h-0 w-full"
        style={{ height: `${iframeHeight + 3}px` }}
        title="Email content preview"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
      />
      {hasReplies && (
        <button
          type="button"
          className="absolute bottom-0 left-0 text-muted-foreground hover:text-foreground"
          onClick={() => setShowReplies(!showReplies)}
        >
          ...
        </button>
      )}
    </div>
  );
}

export function PlainEmail({ text }: { text: string }) {
  return <pre className="whitespace-pre-wrap text-foreground">{text}</pre>;
}

function getEmailContent(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const quoteContainer = doc.querySelector(".gmail_quote_container");

  if (!quoteContainer) {
    return { mainContent: html, hasReplies: false };
  }

  // Clone the document and remove the quote container
  const mainDoc = doc.cloneNode(true) as Document;
  const mainQuoteContainer = mainDoc.querySelector(".gmail_quote_container");
  mainQuoteContainer?.remove();

  return {
    mainContent: mainDoc.body.innerHTML,
    hasReplies: true,
  };
}

function getIframeHtml(html: string, isDarkMode: boolean) {
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
      }
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

      /* Base styles with low specificity - only apply to completely unstyled content */
      body:not([style]):not([bgcolor]) {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        margin: 0;
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

  const securityHeaders = `
    <meta http-equiv="Content-Security-Policy" content="
      default-src 'none';
      style-src 'unsafe-inline';
      img-src data: https:;
      font-src 'none';
      script-src 'none';
      frame-src 'none';
      object-src 'none';
      base-uri 'none';
      form-action 'none';
    ">
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
  `;

  const headContent = `${securityHeaders}${defaultFontStyles}<base target="_blank" rel="noopener noreferrer">`;

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

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

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

function useIframeHeight(iframeRef: React.RefObject<HTMLIFrameElement | null>) {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 5;
    const initialDelay = 100;

    const updateHeight = () => {
      try {
        if (iframeRef.current?.contentWindow) {
          const newHeight =
            iframeRef.current.contentWindow.document.documentElement
              ?.scrollHeight;
          if (newHeight) {
            setHeight(newHeight);
            return true;
          }
        }
      } catch (error) {
        console.error("Failed to get iframe height:", error);
      }
      return false;
    };

    const attemptUpdate = () => {
      if (attempts >= maxAttempts) return;

      const success = updateHeight();
      if (!success) {
        attempts++;
        setTimeout(attemptUpdate, initialDelay * 2 ** attempts);
      }
    };

    const initialTimeoutId = setTimeout(attemptUpdate, initialDelay);
    return () => clearTimeout(initialTimeoutId);
  }, [iframeRef?.current?.contentWindow]);

  return height;
}
