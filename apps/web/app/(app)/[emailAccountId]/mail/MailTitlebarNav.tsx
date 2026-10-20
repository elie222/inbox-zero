"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/utils";

/**
 * The sidebar toggle that sits beside the mac traffic lights once the sidebar
 * is collapsed. The desktop app's back/forward live in its View menu.
 */
export function MailTitlebarNav({ className }: { className?: string }) {
  const { state } = useSidebar();
  const isSidebarOpen = state.includes("left-sidebar");

  if (isSidebarOpen) return null;

  return (
    <div
      className={cn(
        // The sidebar, and so its toggle, only exists from `lg` up.
        "hidden shrink-0 items-center lg:flex",
        className,
      )}
    >
      <SidebarTrigger
        name="left-sidebar"
        className="size-8 text-muted-foreground"
      />
    </div>
  );
}
