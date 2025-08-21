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
  const { state } = useSidebar();
  const isOpen = state.includes(name);

  return (
    <div
      className={cn(
        "fixed right-0 top-0 z-10 h-screen w-[450px] border-l bg-background transition-transform duration-200 ease-linear",
        "hidden lg:block",
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
