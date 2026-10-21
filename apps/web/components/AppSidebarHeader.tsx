"use client";

import Link from "next/link";
import { MailIcon, SparklesIcon } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";
import { prefixPath } from "@/utils/path";

type AppSection = "mail" | "assistant";

const SECTIONS = [
  { id: "mail", name: "Mail", path: "/mail", icon: MailIcon },
  {
    id: "assistant",
    name: "Assistant",
    path: "/automation",
    icon: SparklesIcon,
  },
] as const;

/**
 * The top of both the app and mail sidebars: the sidebar toggle plus the
 * switch between the mail client and the AI assistant. Shared so the two
 * sidebars line up identically, including below the mac traffic lights.
 */
export function AppSidebarHeader({
  active,
  emailAccountId,
  collapsed,
}: {
  active: AppSection;
  emailAccountId: string;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <div data-desktop-mac-titlebar-spacer>
        <div className="pb-2">
          <SidebarTrigger name="left-sidebar" />
        </div>
        <AppSectionSwitcher
          active={active}
          emailAccountId={emailAccountId}
          collapsed
        />
      </div>
    );
  }

  return (
    <div
      data-desktop-mac-titlebar-spacer
      className="flex shrink-0 items-center gap-1 pb-2"
    >
      <AppSectionSwitcher
        active={active}
        emailAccountId={emailAccountId}
        collapsed={false}
      />
      <SidebarTrigger name="left-sidebar" />
    </div>
  );
}

function AppSectionSwitcher({
  active,
  emailAccountId,
  collapsed,
}: {
  active: AppSection;
  emailAccountId: string;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <nav aria-label="App sections" className="flex flex-col gap-1 pb-2">
        {SECTIONS.map((section) => {
          const isActive = section.id === active;
          return (
            <Tooltip key={section.id}>
              <TooltipTrigger asChild>
                <Link
                  href={prefixPath(emailAccountId, section.path)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive &&
                      "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                >
                  <section.icon className="size-4" />
                  <span className="sr-only">{section.name}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{section.name}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="App sections"
      className="grid flex-1 grid-cols-2 gap-0.5 rounded-lg bg-sidebar-accent p-0.5"
    >
      {SECTIONS.map((section) => {
        const isActive = section.id === active;
        return (
          <Link
            key={section.id}
            href={prefixPath(emailAccountId, section.path)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <section.icon className="size-3.5 shrink-0" />
            {section.name}
          </Link>
        );
      })}
    </nav>
  );
}
