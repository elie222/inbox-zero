"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect } from "react";
import {
  CHAT_SIDEBAR_DEFAULT_WIDTH,
  CHAT_SIDEBAR_WIDTH_BOUNDS,
  CHAT_SIDEBAR_WIDTH_COOKIE,
} from "@/components/chat-sidebar-width";
import { PanelResizeHandle } from "@/components/PanelResizeHandle";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/utils";
import { persistPanelWidth } from "@/utils/panel-width";

const Chat = dynamic(
  () => import("@/components/assistant-chat/chat").then((mod) => mod.Chat),
  { ssr: false },
);

export function SidebarRight({
  name,
  className,
  onResize,
}: {
  name: string;
  className?: string;
  /** Applies a width while the panel's edge is dragged. */
  onResize: (width: number) => void;
}) {
  const { isOpen, close } = useSidebarPanel(name);
  const onResetWidth = useCallback(() => {
    onResize(CHAT_SIDEBAR_DEFAULT_WIDTH);
    persistPanelWidth(CHAT_SIDEBAR_WIDTH_COOKIE, null);
  }, [onResize]);

  return (
    <div
      className={cn(
        "fixed right-0 top-0 z-50 h-dvh border-l bg-background transition-transform duration-200 ease-linear",
        "w-full lg:w-[--chat-sidebar-width]",
        isOpen ? "translate-x-0" : "translate-x-full",
        className,
      )}
    >
      <div className="flex h-full w-full flex-col overflow-hidden">
        {isOpen ? <Chat open onClose={close} /> : null}
      </div>
      {isOpen ? (
        <PanelResizeHandle
          label="Resize assistant"
          edge="left"
          bounds={CHAT_SIDEBAR_WIDTH_BOUNDS}
          onResize={onResize}
          onResizeEnd={persistChatSidebarWidth}
          onReset={onResetWidth}
        />
      ) : null}
    </div>
  );
}

function persistChatSidebarWidth(width: number) {
  persistPanelWidth(CHAT_SIDEBAR_WIDTH_COOKIE, width);
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
