"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDownIcon, ChevronRightIcon, SettingsIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { cn } from "@/utils";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  getAppPageFromNavItem,
  getAppPageFromPathname,
  getAppPageProperties,
  PRODUCT_ANALYTICS_EVENTS,
  APP_PAGES,
} from "@/utils/analytics/product";

type NavItem = {
  name: string;
  // Display override (e.g. last segment of a nested label); name stays the
  // full value for keys, tooltips, and analytics
  shortName?: string;
  href: string;
  icon: LucideIcon | ((props: ComponentProps<"svg">) => React.ReactNode);
  target?: "_blank";
  count?: number;
  active?: boolean;
  beta?: boolean;
  new?: boolean;
  // Nesting depth for tree-style panels (labels → companies)
  indent?: 1 | 2;
  // Collapsible tree parents render a chevron that toggles their children
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  // Rows that can be configured render a gear (folders open their settings)
  onOpenSettings?: () => void;
};

export function SideNavMenu({
  items,
  activeHref,
}: {
  items: NavItem[];
  activeHref: string;
}) {
  const { closeMobileSidebar } = useSidebar();
  const pathname = usePathname();
  const posthog = usePostHog();
  const currentAppPage = getAppPageFromPathname(pathname);

  return (
    <SidebarMenu>
      {items.map((item) => (
        // Names can repeat (e.g. a company named like a group); hrefs are
        // unique per destination, so key on both
        <SidebarMenuItem
          key={`${item.href}|${item.name}`}
          className="font-semibold"
        >
          <SidebarMenuButton
            asChild
            // An item that computes its own active state wins; the
            // path-equality fallback is only for items that don't set one
            // (it can't tell sub-views apart since it ignores the query)
            isActive={item.active ?? activeHref === item.href}
            className={cn(
              "h-9",
              item.indent === 1 && "pl-5",
              item.indent === 2 && "pl-8",
            )}
            tooltip={item.name}
            sidebarName="left-sidebar"
          >
            <Link
              href={item.href}
              onClick={() => {
                const destinationAppPage = getAppPageFromNavItem({
                  name: item.name,
                  href: item.href,
                });

                posthog.capture(PRODUCT_ANALYTICS_EVENTS.navigationClicked, {
                  ...getAppPageProperties(currentAppPage),
                  destination_page: destinationAppPage,
                  destination_page_label: destinationAppPage
                    ? APP_PAGES[destinationAppPage].label
                    : undefined,
                  nav_item: item.name,
                  nav_href_type: getNavHrefType(item.href),
                });
                closeMobileSidebar("left-sidebar");
              }}
            >
              <item.icon />
              {/* min-w-0 + truncate: long label names must not push the
                  count out of the panel */}
              <span className="min-w-0 truncate">
                {item.shortName ?? item.name}
              </span>
              {typeof item.count === "number" && item.count > 0 && (
                <span className="ml-auto shrink-0 text-xs font-medium tabular-nums text-primary">
                  {item.count > 999 ? "999+" : item.count}
                </span>
              )}
              {item.onOpenSettings && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${item.name} settings`}
                  className={cn(
                    "shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground",
                    !(typeof item.count === "number" && item.count > 0) &&
                      "ml-auto",
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    item.onOpenSettings?.();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      item.onOpenSettings?.();
                    }
                  }}
                >
                  <SettingsIcon className="size-3.5" />
                </span>
              )}
              {item.expandable && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={item.expanded ? "Collapse" : "Expand"}
                  className={cn(
                    "shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground",
                    !(typeof item.count === "number" && item.count > 0) &&
                      "ml-auto",
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    item.onToggleExpand?.();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      item.onToggleExpand?.();
                    }
                  }}
                >
                  {item.expanded ? (
                    <ChevronDownIcon className="size-3.5" />
                  ) : (
                    <ChevronRightIcon className="size-3.5" />
                  )}
                </span>
              )}
              {item.new && (
                <Badge variant="green" className="ml-auto text-[10px]">
                  New!
                </Badge>
              )}
              {item.beta && (
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  Beta
                </Badge>
              )}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function getNavHrefType(href: string) {
  if (href.startsWith("?")) return "query";
  if (href.startsWith("http")) return "external";
  return "internal";
}
