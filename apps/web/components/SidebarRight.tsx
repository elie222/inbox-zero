"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect } from "react";
import { PanelResizeHandle } from "@/components/PanelResizeHandle";
import { CHAT_PANEL_WIDTH } from "@/components/assistant-chat/panel-width";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/utils";

const Chat = dynamic(
  () => import("@/components/assistant-chat/chat").then((mod) => mod.Chat),
  { ssr: false },
);

export function SidebarRight({
  name,
  onResize,
  className,
}: {
  name: string;
  onResize: (width: number) => void;
  className?: string;
}) {
  const { isOpen, close } = useSidebarPanel(name);

  return (
    <div
      className={cn(
        "fixed right-0 top-0 z-50 h-dvh border-l bg-background transition-transform duration-200 ease-linear",
        "w-full lg:w-[var(--chat-panel-width)]",
        isOpen ? "translate-x-0" : "translate-x-full",
        className,
      )}
    >
      {isOpen ? (
        <PanelResizeHandle
          config={CHAT_PANEL_WIDTH}
          edge="start"
          label="Resize assistant"
          onResize={onResize}
          className="hidden lg:block"
        />
      ) : null}
      <div className="flex h-full w-full flex-col overflow-hidden">
        {isOpen ? <Chat open onClose={close} /> : null}
      </div>
    </div>
  );
}

function useSidebarPanel(name: string) {
  const { state, openMobile, isMobile, setOpen, setOpenMobile } = useSidebar();
  const isOpen = isMobile ? openMobile.includes(name) : state.includes(name);
  const close = useCallback(() => {
    const removeSidebar = (openSidebars: string[]) =>
      openSidebars.filter((sidebarName) => sidebarName !== name);

    setOpen(removeSidebar);
    setOpenMobile(removeSidebar);
  }, [name, setOpen, setOpenMobile]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isOpen]);

  return { close, isOpen };
}
