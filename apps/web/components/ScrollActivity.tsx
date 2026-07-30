"use client";

import { useEffect } from "react";

// Marks the document while anything on the page is scrolling, which is what
// scrollbar.css keys the thumb's visibility off — scrollbars fade back out
// shortly after scrolling stops.
export function ScrollActivity() {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    // Capture: scroll events don't bubble, so this is the only way one
    // listener can see every scroller on the page
    const onScroll = () => {
      document.documentElement.dataset.scrolling = "true";
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        delete document.documentElement.dataset.scrolling;
      }, 700);
    };

    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      clearTimeout(timeout);
      delete document.documentElement.dataset.scrolling;
    };
  }, []);

  return null;
}
