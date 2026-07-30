"use client";

import { useEffect } from "react";

// Measures how much of the screen the browser already keeps fixed
// bottom-anchored elements away from (some standalone-mode browsers end the
// layout viewport above the home indicator; others run it to the physical
// edge). globals.css subtracts this from the safe-area inset so the app tray
// pads only what the browser didn't already reserve — never both.
export function ViewportInsetProbe() {
  useEffect(() => {
    const measure = () => {
      // In portrait standalone the screen is the physical display; the
      // difference to the layout viewport is whatever chrome/inset the
      // browser reserved. The keyboard also shrinks innerHeight, but while
      // it's up the tray is obscured anyway, and closing it refires resize.
      const gap = Math.max(0, window.screen.height - window.innerHeight);
      document.documentElement.style.setProperty(
        "--viewport-bottom-gap",
        `${gap}px`,
      );
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  return null;
}
