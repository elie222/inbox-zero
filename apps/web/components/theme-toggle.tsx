"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/utils";
import { useCallback, useRef } from "react";

export function ThemeToggle({ focus }: { focus?: boolean }) {
  const { setTheme, resolvedTheme } = useTheme();
  const ref = useRef<HTMLButtonElement>(null);

  const toggleTheme = useCallback(() => {
    const newTheme = resolvedTheme === "light" ? "dark" : "light";

    // Use View Transition API if available for smooth theme switching
    if (
      typeof document !== "undefined" &&
      "startViewTransition" in document &&
      ref.current
    ) {
      (
        document as typeof document & {
          startViewTransition: (cb: () => void) => void;
        }
      ).startViewTransition(() => {
        setTheme(newTheme);
      });
    } else {
      setTheme(newTheme);
    }
  }, [resolvedTheme, setTheme]);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex w-full items-center rounded-md px-3 py-1.5 text-sm leading-6 text-foreground transition-colors",
        "hover:bg-muted/50",
        focus && "bg-accent",
      )}
      onClick={toggleTheme}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleTheme();
        }
      }}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <span className="relative mr-2 size-4">
        <SunIcon
          className={cn(
            "absolute inset-0 size-4 transition-all duration-300",
            isDark
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0",
          )}
        />
        <MoonIcon
          className={cn(
            "absolute inset-0 size-4 transition-all duration-300",
            isDark
              ? "rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100",
          )}
        />
      </span>
      <span className="font-medium">{isDark ? "Light" : "Dark"} mode</span>
    </button>
  );
}
