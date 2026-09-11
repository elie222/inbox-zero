"use client";

import {
  cloneElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { ThreadReaderProps } from "@/app/(app)/[emailAccountId]/mail/ThreadReader";

type Reader = {
  key: string;
  content: ReactElement<ThreadReaderProps>;
};

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
  const [visible, setVisible] = useState<Reader | null>(null);
  const pendingRef = useRef<HTMLDivElement>(null);
  const readinessDeadline = useRef<{ key: string; expiresAt: number } | null>(
    null,
  );
  const replacing =
    visible !== null &&
    visible.key !== threadKey &&
    visible.content.props.threadId !== null;
  useLayoutEffect(() => {
    if (!replacing) onReady(threadKey);
    if (!dataReady) return;
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
      setVisible({ key: threadKey, content: children });
      onReady(threadKey);
    };
    // A malformed or empty email must not leave navigation locked indefinitely.
    const timeout = setTimeout(commit, Math.max(0, remaining));
    const reveal = () => {
      const iframes = pendingRef.current?.querySelectorAll("iframe");
      // React committing the message does not mean its srcDoc has been parsed
      // and measured. Keep the complete previous reader until both are ready.
      if (
        performance.now() < expiresAt &&
        iframes &&
        Array.from(iframes).some(
          (iframe) => iframe.dataset.emailReady !== "true",
        )
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
  }, [children, onReady, dataReady, threadKey, replacing]);

  const current = {
    key: threadKey,
    content:
      !dataReady && visible?.key === threadKey ? visible.content : children,
  };
  const readers = replacing ? [visible, current] : [current];

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1" aria-busy={replacing}>
      {readers.map((reader) => {
        const pending = replacing && reader.key === threadKey;
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
            inert={replacing}
            aria-hidden={pending || undefined}
          >
            {cloneElement(reader.content, {
              menu: replacing ? undefined : reader.content.props.menu,
              enableMessageNavigation:
                !replacing && reader.content.props.enableMessageNavigation,
              detailSelectionSettled:
                !replacing && reader.content.props.detailSelectionSettled,
            })}
          </div>
        );
      })}
    </div>
  );
}
