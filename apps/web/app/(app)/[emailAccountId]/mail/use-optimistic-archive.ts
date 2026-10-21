import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useStableCallback } from "./use-stable-callback";
import { getListThreadKey, type ListThread } from "./types";

export function useOptimisticArchive(
  threads: ListThread[],
  enabled: boolean,
  scope: string,
) {
  const [pending, setPending] = useState(new Set<string>());
  const rowPositions = useRef<Map<string, number> | undefined>(undefined);
  const visibleThreads = useMemo(
    () =>
      enabled && pending.size > 0
        ? threads.filter(
            (thread) =>
              !pending.has(JSON.stringify([scope, getListThreadKey(thread)])),
          )
        : threads,
    [enabled, pending, scope, threads],
  );
  useLayoutEffect(() => {
    const previousPositions = rowPositions.current;
    rowPositions.current = undefined;
    if (!previousPositions) return;

    for (const thread of visibleThreads) {
      const key = getListThreadKey(thread);
      const previousTop = previousPositions.get(key);
      if (previousTop === undefined) continue;
      const row = document.querySelector<HTMLElement>(
        `[data-mail-thread-key="${CSS.escape(key)}"]`,
      );
      if (!row) continue;
      for (const animation of row.getAnimations()) {
        if (animation.id === "mail-archive-shift") animation.cancel();
      }
      const offset = previousTop - row.getBoundingClientRect().top;
      if (!offset) continue;
      // Hold the empty space while focus moves on, then let the remaining rows close it.
      const animation = row.animate(
        [
          { transform: `translateY(${offset}px)` },
          { transform: "translateY(0)" },
        ],
        {
          delay: 100,
          duration: 100,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
          fill: "backwards",
        },
      );
      animation.id = "mail-archive-shift";
    }
  }, [visibleThreads]);
  const archive = useStableCallback(
    async (keys: string[], submit: (keys: string[]) => Promise<string[]>) => {
      const scopedKeys = keys.map((key) => JSON.stringify([scope, key]));
      if (enabled) {
        if (keys.length === 1)
          rowPositions.current = animateArchiveRow(keys[0]);
        setPending((current) => new Set([...current, ...scopedKeys]));
      }
      try {
        return await submit(keys);
      } catch {
        toast.error("Couldn't queue archiving");
        return [];
      } finally {
        setPending((current) => {
          if (!scopedKeys.some((key) => current.has(key))) return current;
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
  if (!bounds.height || !bounds.width) return;
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>("[data-mail-thread-key]"),
  );
  const positions = new Map<string, number>();
  // Offscreen rows do not need motion or layout measurements.
  for (let index = rows.indexOf(row) + 1; index < rows.length; index++) {
    const nextRow = rows[index];
    const top = nextRow.getBoundingClientRect().top;
    if (top > window.innerHeight + bounds.height) break;
    positions.set(nextRow.dataset.mailThreadKey!, top);
  }
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
    { duration: 80, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" },
  );
  animation.finished.finally(() => ghost.remove()).catch(() => {});
  return positions;
}
