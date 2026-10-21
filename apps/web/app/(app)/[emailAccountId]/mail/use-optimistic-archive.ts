import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useStableCallback } from "./use-stable-callback";
import { getListThreadKey, type ListThread } from "./types";

export function useOptimisticArchive(
  threads: ListThread[],
  enabled: boolean,
  scope: string,
) {
  const [pending, setPending] = useState(new Set<string>());
  const visibleThreads = useMemo(
    () =>
      enabled
        ? threads.filter(
            (thread) =>
              !pending.has(JSON.stringify([scope, getListThreadKey(thread)])),
          )
        : threads,
    [enabled, pending, scope, threads],
  );
  const archive = useStableCallback(
    async (keys: string[], submit: (keys: string[]) => Promise<string[]>) => {
      const scopedKeys = keys.map((key) => JSON.stringify([scope, key]));
      if (enabled) {
        if (keys.length === 1) animateArchiveRow(keys[0]);
        setPending((current) => new Set([...current, ...scopedKeys]));
      }
      try {
        return await submit(keys);
      } catch {
        toast.error("Couldn't queue archiving");
        return [];
      } finally {
        setPending((current) => {
          const next = new Set(current);
          for (const key of scopedKeys) next.delete(key);
          return next;
        });
      }
    },
  );
  return { threads: visibleThreads, archive };
}

function animateArchiveRow(key: string) {
  const row = document.querySelector<HTMLElement>(
    `[data-mail-thread-key="${CSS.escape(key)}"]`,
  );
  if (!row) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bounds = row.getBoundingClientRect();
  // Keep a visual copy so keyboard focus and the live list can advance immediately.
  const ghost = row.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("data-mail-thread-key");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.dataset.archiveExit = "";
  ghost.classList.add("bg-background", "overflow-hidden");
  Object.assign(ghost.style, {
    position: "fixed",
    top: `${bounds.top}px`,
    left: `${bounds.left}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    pointerEvents: "none",
    zIndex: "50",
  });
  document.body.append(ghost);
  // Fade the content over an opaque backing so the next row's text cannot bleed through.
  const animation = (ghost.firstElementChild ?? ghost).animate(
    [
      { transform: "translateX(0)", opacity: 1 },
      { transform: "translateX(-32px)", opacity: 0 },
    ],
    { duration: 140, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" },
  );
  animation.finished.finally(() => ghost.remove()).catch(() => {});
}
