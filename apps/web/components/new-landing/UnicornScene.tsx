"use client";

import { cn } from "@/utils";
import { useEffect } from "react";
import { scheduleAfterPageLoad } from "@/utils/schedule-after-page-load";

type UnicornStudioInitFlag = {
  isInitialized: boolean;
};

declare global {
  interface Window {
    UnicornStudio?: UnicornStudioInitFlag;
  }
  // eslint-disable-next-line no-var
  var UnicornStudio:
    | {
        init: () => void;
      }
    | undefined;
}

interface UnicornSceneProps {
  className?: string;
}

export function UnicornScene({ className }: UnicornSceneProps) {
  useEffect(() => {
    const loadUnicornStudio = () => {
      if (window.UnicornStudio) return;

      // @ts-expect-error - window.UnicornStudio is a flag object, not the global UnicornStudio
      window.UnicornStudio = {
        isInitialized: false,
      };
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.34/dist/unicornStudio.umd.js";
      script.onload = () => {
        if (!window.UnicornStudio?.isInitialized && UnicornStudio) {
          UnicornStudio.init();
          // @ts-expect-error - window.UnicornStudio is a flag object, not the global UnicornStudio
          window.UnicornStudio = {
            isInitialized: true,
          };
        }
      };
      (document.head || document.body).appendChild(script);
    };

    return scheduleAfterPageLoad(loadUnicornStudio, {
      fallbackDelay: 1000,
      idleTimeout: 4000,
    });
  }, []);

  return (
    <div
      data-us-project="7EOg9x6JDnLX6WDUJiAj"
      className={cn("w-full h-full absolute top-0 left-0 -z-10", className)}
    />
  );
}
