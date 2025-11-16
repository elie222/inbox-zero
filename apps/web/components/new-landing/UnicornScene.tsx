"use client";

import { cx } from "class-variance-authority";
import { useEffect } from "react";

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
    if (!window.UnicornStudio) {
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
    }
  }, []);

  return (
    <div
      data-us-project="7EOg9x6JDnLX6WDUJiAj"
      className={cx("w-full h-full absolute top-0 left-0 -z-10", className)}
    />
  );
}
