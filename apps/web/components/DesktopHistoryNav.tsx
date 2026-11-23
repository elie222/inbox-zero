"use client";

import { useSyncExternalStore } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { Tooltip } from "@/components/Tooltip";

/**
 * Back/forward beside the sidebar toggle in the mac desktop titlebar. The
 * desktop app has no browser chrome; a browser tab already has these, so the
 * stylesheet only shows them in the mac desktop shell.
 */
export function DesktopHistoryNav() {
  const { t } = useLingui();
  const canGoBack = useSyncExternalStore(
    subscribeToHistory,
    () => getNavigation()?.canGoBack ?? false,
    () => false,
  );
  const canGoForward = useSyncExternalStore(
    subscribeToHistory,
    () => getNavigation()?.canGoForward ?? false,
    () => false,
  );

  return (
    <div className="hidden items-center gap-0.5" data-desktop-mac-history>
      <Tooltip shortcuts={["goBack"]} side="bottom">
        <button
          type="button"
          aria-label={t`Go back`}
          disabled={!canGoBack}
          onClick={() => window.history.back()}
          className={historyButton}
        >
          <ArrowLeftIcon className="size-4" />
        </button>
      </Tooltip>
      <Tooltip shortcuts={["goForward"]} side="bottom">
        <button
          type="button"
          aria-label={t`Go forward`}
          disabled={!canGoForward}
          onClick={() => window.history.forward()}
          className={historyButton}
        >
          <ArrowRightIcon className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}

const historyButton =
  "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

function getNavigation(): Navigation | null {
  return "navigation" in window ? window.navigation : null;
}

function subscribeToHistory(onChange: () => void) {
  const navigation = getNavigation();
  navigation?.addEventListener("currententrychange", onChange);
  return () => navigation?.removeEventListener("currententrychange", onChange);
}
