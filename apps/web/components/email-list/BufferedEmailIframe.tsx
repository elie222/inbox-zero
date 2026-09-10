import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export const EMAIL_DOCUMENT_MARKER = "inbox-zero-email-document";

type EmailDocument = {
  srcDoc: string;
  documentKey: string;
};

type EmailIframeCallbacks = {
  onForwardMessage?: () => void;
  onReplyMessage?: () => void;
  onNavigateMessage?: (direction: -1 | 1) => void;
  onFocusMessage?: () => void;
};

export function BufferedEmailIframe({
  srcDoc,
  documentKey,
  isDarkMode,
  callbacks,
}: EmailDocument & {
  isDarkMode: boolean;
  callbacks: EmailIframeCallbacks;
}) {
  const [visibleDocument, setVisibleDocument] = useState<EmailDocument>();
  const nextDocument = useMemo(
    () => ({ srcDoc, documentKey }),
    [srcDoc, documentKey],
  );
  const documents =
    visibleDocument && visibleDocument.documentKey !== documentKey
      ? [visibleDocument, nextDocument]
      : [nextDocument];

  return (
    <div className="relative min-w-0">
      {documents.map((document, index) => (
        <EmailIframe
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

function EmailIframe({
  document,
  pending,
  isDarkMode,
  onReady,
  callbacks,
}: {
  document: EmailDocument;
  pending: boolean;
  isDarkMode: boolean;
  onReady: (document: EmailDocument) => void;
  callbacks: EmailIframeCallbacks;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const height = useEmailIframe(
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
      height={1}
      // Measure the replacement without collapsing or unloading the visible email.
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

function useEmailIframe(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  srcDoc: string,
  documentKey: string,
  callbacks: EmailIframeCallbacks,
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
        !handlesKey ||
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
      event.preventDefault();
      if (event.key === "Enter") reply?.();
      else if (key === "f") forward?.();
      else navigate?.(event.key === "ArrowUp" ? -1 : 1);
    };
    const stopObservingDocument = () => {
      observedDocument?.removeEventListener("keydown", navigateMessage);
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
    // `load` waits for remote images. Catch the `srcDoc` document swap first so
    // its parsed layout can be measured while those images are still loading.
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
