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
        "fixed right-0 top-0 z-50 h-screen border-l bg-background transition-transform duration-200 ease-linear",
        "w-full lg:w-[450px]",
        isOpen ? "translate-x-0" : "translate-x-full",
        className,
      )}
    >
      <div className="flex h-full w-full flex-col overflow-hidden">
        <Chat />
      </div>
    </div>
  );
}
