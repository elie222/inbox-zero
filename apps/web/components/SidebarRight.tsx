"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/utils";

const Chat = dynamic(
  () => import("@/components/assistant-chat/chat").then((mod) => mod.Chat),
  { ssr: false },
);

export function SidebarRight({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const { isOpen, close } = useSidebarPanel(name);

  return (
    <div
      className={cn(
        // dvh, not vh: on iOS 100vh is the large viewport, which put the
        // chat's composer and send button below the visible area
        "fixed right-0 top-0 z-50 h-[100dvh] border-l bg-background transition-transform duration-200 ease-linear",
        "w-full lg:w-[450px]",
        isOpen ? "translate-x-0" : "translate-x-full",
        className,
      )}
    >
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
