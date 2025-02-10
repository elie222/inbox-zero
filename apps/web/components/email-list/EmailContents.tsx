import { type SyntheticEvent, useCallback, useMemo, useState } from "react";
import { Loading } from "@/components/Loading";

export function HtmlEmail({ html }: { html: string }) {
  const srcDoc = useMemo(() => getIframeHtml(html), [html]);
  const [isLoading, setIsLoading] = useState(true);

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
    <div>
      {isLoading && <Loading />}
      <iframe
        srcDoc={srcDoc}
        onLoad={onLoad}
        className="h-0 min-h-0 w-full"
        title="Email content preview"
      />
    </div>
  );
}

export function PlainEmail({ text }: { text: string }) {
  return <pre className="whitespace-pre-wrap">{text}</pre>;
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
