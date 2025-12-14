"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon | ((props: any) => React.ReactNode);
  target?: "_blank";
  count?: number;
  hideInMail?: boolean;
  active?: boolean;
};

export function SideNavMenu({
  items,
  activeHref,
}: {
  items: NavItem[];
  activeHref: string;
}) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive = item.active || activeHref === item.href;
        return (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              className="h-9 transition-colors hover:bg-muted/50"
              tooltip={item.name}
              sidebarName="left-sidebar"
            >
              <Link href={item.href}>
                <item.icon
                  className={
                    isActive ? "text-primary" : "text-muted-foreground"
                  }
                />
                <span className="font-medium">{item.name}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                    {item.count}
                  </span>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
