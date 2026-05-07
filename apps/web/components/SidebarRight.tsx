"use client";

import { XIcon } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Chat } from "@/components/assistant-chat/chat";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

export function SidebarRight({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const { state, openMobile, isMobile, toggleSidebar } = useSidebar();
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
        <div className="flex items-center justify-end border-b px-2 py-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => toggleSidebar([name])}
            aria-label="Close chat"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <Chat open={isOpen} />
      </div>
    </div>
  );
}
