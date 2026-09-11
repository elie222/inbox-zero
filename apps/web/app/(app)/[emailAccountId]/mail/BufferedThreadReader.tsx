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
  const replacing = visible !== null && visible.key !== threadKey;
  useLayoutEffect(() => {
    if (!dataReady) return;
    let frame: number;
    const reveal = () => {
      const iframes = pendingRef.current?.querySelectorAll("iframe");
      // React committing the message does not mean its srcDoc has been parsed
      // and measured. Keep the complete previous reader until both are ready.
      if (
        iframes &&
        Array.from(iframes).some(
          (iframe) => iframe.dataset.emailReady !== "true",
        )
      ) {
        frame = requestAnimationFrame(reveal);
        return;
      }
      setVisible({ key: threadKey, content: children });
      onReady(threadKey);
    };
    reveal();
    return () => cancelAnimationFrame(frame);
  }, [children, onReady, dataReady, threadKey]);

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
