"use client";

import { cn } from "@/utils";
import { useEffect, useId, useRef } from "react";
import { scheduleAfterPageLoad } from "@/utils/schedule-after-page-load";

const UNICORN_STUDIO_SRC =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.34/dist/unicornStudio.umd.js";
const UNICORN_STUDIO_PROJECT_ID = "7EOg9x6JDnLX6WDUJiAj";

type UnicornStudioScene = {
  destroy: () => void;
};

type UnicornStudioApi = {
  addScene: (options: {
    dpi: number;
    elementId: string;
    fps: number;
    lazyLoad: boolean;
    projectId: string;
    scale: number;
  }) => Promise<UnicornStudioScene>;
};

declare global {
  interface Window {
    UnicornStudio?: UnicornStudioApi;
  }
}

let unicornStudioLoadPromise: Promise<UnicornStudioApi> | undefined;

interface UnicornSceneProps {
  className?: string;
}

export function UnicornScene({ className }: UnicornSceneProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const sceneId = `unicorn-scene-${useId()}`;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let disposed = false;
    let scene: UnicornStudioScene | undefined;

    const initializeScene = async () => {
      const studio = await loadUnicornStudio();
      if (disposed || !element.isConnected) return;

      const initializedScene = await studio.addScene({
        dpi: 1,
        elementId: sceneId,
        fps: 30,
        lazyLoad: true,
        projectId: UNICORN_STUDIO_PROJECT_ID,
        scale: 1,
      });

      if (disposed || !element.isConnected) {
        initializedScene.destroy();
      } else {
        scene = initializedScene;
      }
    };

    const cancelInitialization = scheduleAfterPageLoad(
      () => {
        initializeScene().catch(() => undefined);
      },
      {
        fallbackDelay: 1000,
        idleTimeout: 4000,
      },
    );

    return () => {
      disposed = true;
      cancelInitialization();
      scene?.destroy();
    };
  }, [sceneId]);

  return (
    <div
      ref={elementRef}
      id={sceneId}
      aria-hidden="true"
      className={cn("w-full h-full absolute top-0 left-0 -z-10", className)}
    />
  );
}

function loadUnicornStudio() {
  if (window.UnicornStudio?.addScene) {
    return Promise.resolve(window.UnicornStudio);
  }

  if (!unicornStudioLoadPromise) {
    unicornStudioLoadPromise = new Promise<UnicornStudioApi>(
      (resolve, reject) => {
        const script = document.createElement("script");

        const onLoad = () => {
          if (window.UnicornStudio?.addScene) {
            resolve(window.UnicornStudio);
          } else {
            script.remove();
            reject(new Error("Unicorn Studio failed to initialize"));
          }
        };

        const onError = () => {
          script.remove();
          reject(new Error("Unicorn Studio failed to load"));
        };

        script.addEventListener("load", onLoad, { once: true });
        script.addEventListener("error", onError, { once: true });

        script.src = UNICORN_STUDIO_SRC;
        (document.head || document.body).appendChild(script);
      },
    ).catch((error: unknown) => {
      unicornStudioLoadPromise = undefined;
      throw error;
    });
  }

  return unicornStudioLoadPromise;
}
