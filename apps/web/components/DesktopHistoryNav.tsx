"use client";

import { useSyncExternalStore } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";

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
    <div className="hidden items-center gap-1" data-desktop-mac-history>
      <Tooltip shortcuts={["goBack"]} side="bottom">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={t`Go back`}
          disabled={!canGoBack}
          onClick={() => window.history.back()}
        >
          <ArrowLeftIcon />
        </Button>
      </Tooltip>
      <Tooltip shortcuts={["goForward"]} side="bottom">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={t`Go forward`}
          disabled={!canGoForward}
          onClick={() => window.history.forward()}
        >
          <ArrowRightIcon />
        </Button>
      </Tooltip>
    </div>
  );
}

function getNavigation(): Navigation | null {
  return "navigation" in window ? window.navigation : null;
}

function subscribeToHistory(onChange: () => void) {
  const navigation = getNavigation();
  navigation?.addEventListener("currententrychange", onChange);
  return () => navigation?.removeEventListener("currententrychange", onChange);
}
