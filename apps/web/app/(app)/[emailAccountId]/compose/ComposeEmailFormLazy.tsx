"use client";

import { type ComponentProps, useEffect, useRef } from "react";
import { registerOpenComposer } from "@/utils/safe-reload";
import dynamic from "next/dynamic";
import { Loading } from "@/components/Loading";
import {
  trackComposerMounted,
  trackComposerUnmountedWhileFocused,
  trackKeyAfterEditorRemoved,
} from "@/utils/analytics/composer-stability";

// keep bundle size down by importing dynamically on use
const ComposeEmailForm = dynamic(
  () => import("./ComposeEmailForm").then((mod) => mod.ComposeEmailForm),
  {
    loading: () => <Loading />,
  },
);

export function ComposeEmailFormLazy(
  props: ComponentProps<typeof ComposeEmailForm>,
) {
  useEffect(registerOpenComposer, []);
  const { draftSessionId, draftMode } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  // The element typed in last, kept while it is removed from under the user
  // and cleared when they move focus elsewhere themselves.
  const focusedElement = useRef<Element | null>(null);
  const closing = useRef(false);
  useEffect(() => {
    trackComposerMounted({ draftSessionId, draftMode });
    // A key pressed with nothing focused, after the editor was removed, reaches
    // the page's shortcuts instead of the draft.
    const onKeyDown = () => {
      const element = focusedElement.current;
      if (!element || element.isConnected || closing.current) return;
      if (document.activeElement && document.activeElement !== document.body)
        return;
      focusedElement.current = null;
      trackKeyAfterEditorRemoved(draftMode);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (focusedElement.current && !closing.current)
        trackComposerUnmountedWhileFocused(draftSessionId);
    };
  }, [draftSessionId, draftMode]);
  const closeWith = <Args extends unknown[], Result>(
    handler?: (...args: Args) => Result,
  ) =>
    handler &&
    ((...args: Args) => {
      closing.current = true;
      return handler(...args);
    });
  const { onDiscard } = props;

  return (
    <div
      className="contents"
      ref={containerRef}
      onFocus={(event) => {
        focusedElement.current = event.target;
      }}
      onBlur={(event) => {
        const element = event.target;
        // Look once the commit is done: an editor removed by a re-render keeps
        // its place, one the user left is forgotten.
        queueMicrotask(() => {
          const container = containerRef.current;
          if (
            element.isConnected &&
            container &&
            !container.contains(document.activeElement)
          )
            focusedElement.current = null;
        });
      }}
    >
      <ComposeEmailForm
        {...props}
        onClose={closeWith(props.onClose)}
        onDiscard={
          onDiscard &&
          (async (draftId?: string) => {
            closing.current = true;
            const discarded = await onDiscard(draftId);
            if (discarded === false) closing.current = false;
            return discarded;
          })
        }
        onMarkDone={closeWith(props.onMarkDone)}
        onPopOut={closeWith(props.onPopOut)}
        onSuccess={closeWith(props.onSuccess)}
      />
    </div>
  );
}
