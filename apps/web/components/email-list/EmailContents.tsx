import { type SyntheticEvent, useCallback, useMemo, useState } from "react";
import { Loading } from "@/components/Loading";

export function HtmlEmail({ html }: { html: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [showReplies, setShowReplies] = useState(false);

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
      }
    },
    [],
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
  return <pre className="whitespace-pre-wrap">{text}</pre>;
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
      /* Base styles with low specificity */
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        margin: 0;
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
