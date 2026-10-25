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
  hideToggle = false,
}: {
  active: AppSection;
  emailAccountId: string;
  collapsed: boolean;
  /** For sheets, which close on their own rather than collapsing. */
  hideToggle?: boolean;
}) {
  // On mac desktop the toggle is lifted beside the traffic lights in both
  // states, so the header only needs to clear the lights' drag region, which
  // swallows clicks. The sidebars sit 0.5rem below the window top.
  if (collapsed) {
    return (
      <div className="flex flex-col items-start pt-[max(0px,calc(var(--desktop-traffic-lights-height,0px)-0.5rem))]">
        <SidebarTrigger
          name="left-sidebar"
          className="mb-2"
          data-desktop-mac-titlebar-toggle
        />
        <AppSectionSwitcher
          active={active}
          emailAccountId={emailAccountId}
          collapsed
        />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col pt-[max(0px,calc(var(--desktop-traffic-lights-height,0px)-0.5rem))] pb-2">
      <div className="flex items-center gap-1">
        <AppSectionSwitcher
          active={active}
          emailAccountId={emailAccountId}
          collapsed={false}
        />
        {hideToggle ? null : (
          <SidebarTrigger
            name="left-sidebar"
            data-desktop-mac-titlebar-toggle
          />
        )}
      </div>
      <span
        data-hide-on-desktop-mac
        className="mt-2 block truncate border-t border-sidebar-border px-2 pt-1.5 text-[13px] font-semibold text-sidebar-primary"
      >
        Pure Local
      </span>
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
              "flex items-center justify-center rounded-md px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {section.name}
          </Link>
        );
      })}
    </nav>
  );
}
