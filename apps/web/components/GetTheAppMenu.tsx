"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MonitorIcon, SmartphoneIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

export function GetTheAppSidebarButton() {
  const { isMobile, state } = useSidebar();
  const isDesktopApp = useIsDesktopApp();
  const isExpandedSidebar = state.includes("left-sidebar");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="h-9 font-semibold">
          <SmartphoneIcon />
          <span>Get the app</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-52"
        side={isMobile ? "bottom" : isExpandedSidebar ? "top" : "right"}
        align={isExpandedSidebar ? "start" : "end"}
        sideOffset={4}
      >
        {!isDesktopApp && (
          <DropdownMenuItem asChild>
            <Link href="/download" target="_blank" prefetch={false}>
              <MonitorIcon className="mr-2 size-4" />
              Mac and Windows
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/ios" target="_blank" prefetch={false}>
            <SmartphoneIcon className="mr-2 size-4" />
            iPhone
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/android" target="_blank" prefetch={false}>
            <SmartphoneIcon className="mr-2 size-4" />
            Android
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function GetTheAppLinks() {
  const isDesktopApp = useIsDesktopApp();

  return (
    <span className="flex flex-wrap gap-x-3">
      {!isDesktopApp && <AppLink href="/download">Mac and Windows</AppLink>}
      <AppLink href="/ios">iPhone</AppLink>
      <AppLink href="/android">Android</AppLink>
    </span>
  );
}

function AppLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      prefetch={false}
      className="underline underline-offset-4 hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function useIsDesktopApp() {
  const [isDesktopApp, setIsDesktopApp] = useState(false);

  useEffect(() => {
    setIsDesktopApp(Boolean(getInboxZeroDesktopApp()));
  }, []);

  return isDesktopApp;
}
