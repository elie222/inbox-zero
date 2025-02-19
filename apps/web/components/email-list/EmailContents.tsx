import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import DOMPurify from "dompurify";

export function HtmlEmail({ html }: { html: string }) {
  const [showReplies, setShowReplies] = useState(false);
  // const { theme } = useTheme();
  // const isDarkMode = theme === "dark";

  const sanitizedHtml = useMemo(() => sanitize(html), [html]);

  const { mainContent, hasReplies } = useMemo(
    () => getEmailContent(sanitizedHtml),
    [sanitizedHtml],
  );

  const srcDoc = useMemo(
    () => getIframeHtml(showReplies ? sanitizedHtml : mainContent),
    [sanitizedHtml, mainContent, showReplies],
  );

  return (
    <div className="relative">
      <iframe
        srcDoc={srcDoc}
        className="h-0 min-h-[200px] w-full"
        title="Email content preview"
        sandbox=""
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

function getIframeHtml(html: string) {
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

  let htmlWithHead = "";
  if (html.indexOf("</head>") === -1) {
    htmlWithHead = `<head>${securityHeaders}${defaultFontStyles}<base target="_blank" rel="noopener noreferrer"></head>${html}`;
  } else {
    // Insert our styles and security headers after the existing head tag
    htmlWithHead = html.replace(
      "</head>",
      `${securityHeaders}${defaultFontStyles}</head>`,
    );
  }

  return htmlWithHead;
}

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
