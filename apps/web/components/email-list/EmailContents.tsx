import { type SyntheticEvent, useCallback, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Loading } from "@/components/Loading";

export function HtmlEmail({ html }: { html: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [showReplies, setShowReplies] = useState(false);
  const { theme } = useTheme();

  const { mainContent, hasReplies } = useMemo(
    () => getEmailContent(html),
    [html],
  );

  const srcDoc = useMemo(
    () => getIframeHtml(showReplies ? html : mainContent),
    [html, mainContent, showReplies],
  );

  const onLoad = useCallback(
    (event: SyntheticEvent<HTMLIFrameElement, Event>) => {
      if (event.currentTarget.contentWindow) {
        // sometimes we see minimal scrollbar, so add a buffer
        const BUFFER = 5;

        const height = `${
          event.currentTarget.contentWindow.document.documentElement
            .scrollHeight + BUFFER
        }px`;

        event.currentTarget.style.height = height;
        setIsLoading(false);

        // Add dark mode class based on theme
        if (theme === "dark") {
          event.currentTarget.contentWindow.document.documentElement.classList.add(
            "dark",
          );
        }
      }
    },
    [theme],
  );

  return (
    <div className="relative">
      {isLoading && <Loading />}
      <iframe
        srcDoc={srcDoc}
        onLoad={onLoad}
        className="h-0 min-h-0 w-full"
        title="Email content preview"
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
  // Always inject our default font styles with lower specificity
  // This ensures styled elements keep their fonts while unstyled ones get our defaults
  const defaultFontStyles = `
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

      /* Base styles with low specificity */
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        margin: 0;
        color: hsl(var(--foreground));
        background-color: hsl(var(--background));
      }

      /* Style blockquotes and quoted text */
      blockquote, .gmail_quote {
        color: hsl(var(--muted-foreground));
        border-left: 3px solid hsl(var(--muted-foreground) / 0.2);
        margin: 0;
        padding-left: 1rem;
      }

      /* Style links */
      a {
        color: hsl(var(--foreground));
        text-decoration: underline;
      }

      /* Style quoted text */
      .gmail_quote, .gmail_quote * {
        color: hsl(var(--muted-foreground));
      }
    </style>
  `;

  let htmlWithHead = "";
  if (html.indexOf("</head>") === -1) {
    htmlWithHead = `<head>${defaultFontStyles}<base target="_blank"></head>${html}`;
  } else {
    htmlWithHead = html.replace(
      "</head>",
      `${defaultFontStyles}<base target="_blank" rel="noopener noreferrer"></head>`,
    );
  }

  return htmlWithHead;
}
