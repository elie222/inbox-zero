"use client";

import { DownloadIcon } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useDesktopUpdateStatus } from "@/hooks/useDesktopUpdateStatus";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

export function DesktopUpdateMenuItem() {
  const status = useDesktopUpdateStatus();
  if (status?.state !== "ready") return null;
  return (
    <SidebarMenu>
      <SidebarMenuItem className="font-semibold">
        <SidebarMenuButton
          className="h-9"
          tooltip="Restart to update"
          sidebarName="left-sidebar"
          onClick={() => getInboxZeroDesktopApp()?.installUpdate?.()}
        >
          <DownloadIcon />
          <span>Restart to update</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
