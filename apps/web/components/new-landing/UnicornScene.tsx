"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    UnicornStudio?: {
      isInitialized: boolean;
    };
  }
  // eslint-disable-next-line no-var
  var UnicornStudio: { init: () => void } | undefined;
}

const SCRIPT_URL =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.34/dist/unicornStudio.umd.js";

function initializeUnicornStudio() {
  if (
    typeof UnicornStudio !== "undefined" &&
    UnicornStudio &&
    window.UnicornStudio &&
    !window.UnicornStudio.isInitialized
  ) {
    try {
      UnicornStudio.init();
      window.UnicornStudio.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize UnicornStudio:", error);
      window.UnicornStudio.isInitialized = false;
    }
  }
}

export function UnicornScene() {
  const initAttemptedRef = useRef(false);

  useEffect(() => {
    // Initialize tracking if not exists
    if (!window.UnicornStudio) {
      // @ts-expect-error - UnicornStudio is a third-party library
      window.UnicornStudio = { isInitialized: false };
    }

    let checkInterval: NodeJS.Timeout | null = null;
    let initInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    // Check if script is already loaded
    const existingScript = document.querySelector(
      `script[src="${SCRIPT_URL}"]`,
    );

    if (existingScript) {
      // Script already exists, try to initialize
      if (typeof UnicornStudio !== "undefined" && UnicornStudio) {
        initializeUnicornStudio();
      } else {
        // Script exists but UnicornStudio not ready, wait for it
        checkInterval = setInterval(() => {
          if (typeof UnicornStudio !== "undefined" && UnicornStudio) {
            initializeUnicornStudio();
            if (checkInterval) clearInterval(checkInterval);
          }
        }, 100);

        // Cleanup after 10 seconds
        timeoutId = setTimeout(() => {
          if (checkInterval) clearInterval(checkInterval);
        }, 10_000);
      }
    } else {
      // Script doesn't exist, load it
      if (!initAttemptedRef.current) {
        initAttemptedRef.current = true;
        const script = document.createElement("script");
        script.src = SCRIPT_URL;
        script.async = true;

        script.onload = () => {
          // Wait a bit for UnicornStudio to be available
          initInterval = setInterval(() => {
            if (typeof UnicornStudio !== "undefined" && UnicornStudio) {
              initializeUnicornStudio();
              if (initInterval) clearInterval(initInterval);
            }
          }, 50);

          // Fallback: try direct initialization after 1 second
          timeoutId = setTimeout(() => {
            initializeUnicornStudio();
            if (initInterval) clearInterval(initInterval);
          }, 1000);
        };

        script.onerror = () => {
          console.error("Failed to load UnicornStudio script");
          initAttemptedRef.current = false;
        };

        (document.head || document.body).appendChild(script);
      }
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (initInterval) clearInterval(initInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div
      data-us-project="7EOg9x6JDnLX6WDUJiAj"
      className="w-full h-full opacity-20"
    />
  );
}
