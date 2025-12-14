"use client";

import { useSidebar } from "@/components/ui/sidebar";
import { Chat } from "@/components/assistant-chat/chat";
import { cn } from "@/utils";

export function SidebarRight({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const { state, openMobile, isMobile } = useSidebar();
  const isOpen = isMobile ? openMobile.includes(name) : state.includes(name);

  return (
    <div
      className={cn(
        "fixed right-0 top-0 z-50 h-screen border-l border-border/50 bg-background/95 backdrop-blur-sm",
        "transition-all duration-300 ease-out",
        "w-full lg:w-[450px]",
        "shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.1)] dark:shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.4)]",
        isOpen ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
        className,
      )}
    >
      <div className="flex h-full w-full flex-col overflow-hidden">
        <Chat />
      </div>
    </div>
  );
}
