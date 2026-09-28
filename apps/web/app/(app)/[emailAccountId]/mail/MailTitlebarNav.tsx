"use client";

import { useSyncExternalStore } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/utils";

/**
 * The window controls that sit beside the mac traffic lights: the sidebar
 * toggle once the sidebar is collapsed, then back/forward. The desktop app has
 * no browser chrome, so it needs its own history buttons; a browser tab
 * already has them.
 */
export function MailTitlebarNav({
  showHistory,
  className,
}: {
  showHistory: boolean;
  className?: string;
}) {
  const { state } = useSidebar();
  const isSidebarOpen = state.includes("left-sidebar");
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

  if (isSidebarOpen && !showHistory) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5",
        // The sidebar, and so its toggle, only exists from `lg` up.
        !showHistory && "hidden lg:flex",
        className,
      )}
    >
      {isSidebarOpen ? null : (
        <SidebarTrigger
          name="left-sidebar"
          className="hidden size-8 text-muted-foreground lg:inline-flex"
        />
      )}
      {showHistory ? (
        <>
          <Tooltip content="Back">
            <button
              type="button"
              aria-label="Go back"
              disabled={!canGoBack}
              onClick={() => window.history.back()}
              className={historyButton}
            >
              <ChevronLeftIcon className="size-4" />
            </button>
          </Tooltip>
          <Tooltip content="Forward">
            <button
              type="button"
              aria-label="Go forward"
              disabled={!canGoForward}
              onClick={() => window.history.forward()}
              className={historyButton}
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </Tooltip>
        </>
      ) : null}
    </div>
  );
}

const historyButton =
  "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

function getNavigation(): Navigation | null {
  return "navigation" in window ? window.navigation : null;
}

function subscribeToHistory(onChange: () => void) {
  const navigation = getNavigation();
  navigation?.addEventListener("currententrychange", onChange);
  return () => navigation?.removeEventListener("currententrychange", onChange);
}
