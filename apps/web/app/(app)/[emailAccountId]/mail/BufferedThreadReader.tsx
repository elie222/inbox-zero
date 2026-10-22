"use client";

import {
  cloneElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { ThreadReaderProps } from "@/app/(app)/[emailAccountId]/mail/ThreadReader";
import { LoadingMiniSpinner } from "@/components/Loading";

export function BufferedThreadReader({
  children,
  threadKey,
  dataReady,
  onReady,
}: {
  children: ReactElement<ThreadReaderProps>;
  threadKey: string;
  dataReady: boolean;
  onReady: (threadKey: string) => void;
}) {
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  // Kept out of state so a parent re-render of the same thread doesn't render
  // the reader a second time.
  const visibleContent = useRef<ReactElement<ThreadReaderProps> | null>(null);
  const pendingRef = useRef<HTMLDivElement>(null);
  const readinessDeadline = useRef<{ key: string; expiresAt: number } | null>(
    null,
  );
  const previous =
    visibleKey !== null && visibleContent.current
      ? { key: visibleKey, content: visibleContent.current }
      : null;
  const replacing =
    previous !== null &&
    previous.key !== threadKey &&
    previous.content.props.threadId !== null;
  const preparing =
    visibleKey !== threadKey && children.props.threadId !== null;
  useLayoutEffect(() => {
    if (readinessDeadline.current?.key !== threadKey) {
      readinessDeadline.current = {
        key: threadKey,
        expiresAt: performance.now() + 2000,
      };
    }
    const { expiresAt } = readinessDeadline.current;
    const remaining = expiresAt - performance.now();
    let frame: number;
    const commit = () => {
      visibleContent.current = children;
      setVisibleKey(threadKey);
      onReady(threadKey);
    };
    // A slow load or a malformed email must not leave the previous thread on
    // screen indefinitely; past the deadline the reader shows its own loading
    // or error state instead.
    const timeout = setTimeout(commit, Math.max(0, remaining));
    if (!dataReady) return () => clearTimeout(timeout);
    const reveal = () => {
      const bodies =
        pendingRef.current?.querySelectorAll<HTMLElement>("[data-email-ready]");
      // React committing the message does not mean its srcDoc has been parsed
      // and measured. Keep the complete previous reader until both are ready.
      if (
        performance.now() < expiresAt &&
        bodies &&
        Array.from(bodies).some((body) => body.dataset.emailReady !== "true")
      ) {
        frame = requestAnimationFrame(reveal);
        return;
      }
      clearTimeout(timeout);
      commit();
    };
    reveal();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [children, onReady, dataReady, threadKey]);

  const current = {
    key: threadKey,
    content:
      !dataReady && previous?.key === threadKey ? previous.content : children,
  };
  const readers = replacing ? [previous, current] : [current];

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1" aria-busy={preparing}>
      {preparing && !replacing && (
        <div
          className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm"
          role="status"
        >
          <LoadingMiniSpinner />
          Loading email…
        </div>
      )}
      {readers.map((reader) => {
        const pending = preparing && reader.key === threadKey;
        return (
          <div
            key={reader.key}
            ref={reader.key === threadKey ? pendingRef : undefined}
            className="flex min-h-0 min-w-0 flex-1"
            style={
              pending
                ? { position: "absolute", inset: 0, visibility: "hidden" }
                : undefined
            }
            inert={preparing}
            aria-hidden={pending || undefined}
          >
            {cloneElement(reader.content, {
              menu: preparing ? undefined : reader.content.props.menu,
              // The outgoing reader keeps its selection bar so it doesn't
              // blink off for the frames before the next thread swaps in.
              enableMessageNavigation:
                !pending && reader.content.props.enableMessageNavigation,
              detailSelectionSettled:
                !preparing && reader.content.props.detailSelectionSettled,
            })}
          </div>
        );
      })}
    </div>
  );
}
