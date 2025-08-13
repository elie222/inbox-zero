"use client";

import { Sidebar, SidebarContent, useSidebar } from "@/components/ui/sidebar";
import { Chat } from "@/components/assistant-chat/chat";

export function SidebarRight({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { state } = useSidebar();

  if (!state.includes("chat-sidebar")) return null;

  return (
    <Sidebar
      collapsible="icon"
      className="sticky top-0 hidden h-svh border-l lg:flex min-w-[450px]"
      side="right"
      {...props}
    >
      <SidebarContent>
        <Chat />
      </SidebarContent>
    </Sidebar>
  );
}
