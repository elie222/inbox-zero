"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getEmailTerminology } from "@/utils/terminology";
import {
  AlertCircleIcon,
  ArchiveIcon,
  ArrowLeftIcon,
  BarChartBigIcon,
  BrushIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FileTextIcon,
  HardDriveIcon,
  InboxIcon,
  type LucideIcon,
  MailsIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  PenIcon,
  PersonStandingIcon,
  RatioIcon,
  SendIcon,
  SparklesIcon,
  TagIcon,
  Users2Icon,
  ZapIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroupLabel,
  SidebarGroup,
  SidebarHeader,
  SidebarGroupContent,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenu,
  useSidebar,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SetupProgressCard } from "@/components/SetupProgressCard";
import { SideNavMenu } from "@/components/SideNavMenu";
import { CommandShortcut } from "@/components/ui/command";
import { useSplitLabels } from "@/hooks/useLabels";
import { LoadingContent } from "@/components/LoadingContent";
import {
  useCleanerEnabled,
  useIntegrationsEnabled,
  useMeetingBriefsEnabled,
} from "@/hooks/useFeatureFlags";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { NavUser } from "@/components/NavUser";
import { PremiumCard } from "@/components/PremiumCard";

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon | (() => React.ReactNode);
  target?: "_blank";
  count?: number;
  hideInMail?: boolean;
  beta?: boolean;
  new?: boolean;
};

export const useNavigation = () => {
  const showCleaner = useCleanerEnabled();
  const showMeetingBriefs = useMeetingBriefsEnabled();
  const showIntegrations = useIntegrationsEnabled();

  const { emailAccount, emailAccountId, provider } = useAccount();
  const currentEmailAccountId = emailAccount?.id || emailAccountId;

  const manageItems: NavItem[] = useMemo(
    () => [
      {
        name: "Chat",
        href: prefixPath(currentEmailAccountId, "/assistant"),
        icon: MessageSquareIcon,
      },
      {
        name: "Assistant",
        href: prefixPath(currentEmailAccountId, "/automation"),
        icon: SparklesIcon,
      },
      {
        name: "Channels",
        href: prefixPath(currentEmailAccountId, "/channels"),
        icon: MessagesSquareIcon,
      },
    ],
    [currentEmailAccountId],
  );

  const cleanupItems: NavItem[] = useMemo(
    () => [
      {
        name: "Bulk Unsubscribe",
        href: prefixPath(currentEmailAccountId, "/bulk-unsubscribe"),
        icon: MailsIcon,
      },
      {
        name: "Bulk Archive",
        href: prefixPath(currentEmailAccountId, "/bulk-archive"),
        icon: ArchiveIcon,
      },
      {
        name: "Analytics",
        href: prefixPath(currentEmailAccountId, "/stats"),
        icon: BarChartBigIcon,
      },
      ...(isGoogleProvider(provider) && showCleaner
        ? [
            {
              name: "Deep Clean",
              href: prefixPath(currentEmailAccountId, "/clean"),
              icon: BrushIcon,
              beta: true,
            },
          ]
        : []),
    ],
    [currentEmailAccountId, provider, showCleaner],
  );

  const moreItems: NavItem[] = useMemo(
    () => [
      {
        name: "Calendars",
        href: prefixPath(currentEmailAccountId, "/calendars"),
        icon: CalendarIcon,
      },
      ...(showMeetingBriefs
        ? [
            {
              name: "Meeting Briefs",
              href: prefixPath(currentEmailAccountId, "/briefs"),
              icon: FileTextIcon,
            },
          ]
        : []),
      {
        name: "Attachments",
        href: prefixPath(currentEmailAccountId, "/drive"),
        icon: HardDriveIcon,
        new: false,
      },
      ...(showIntegrations
        ? [
            {
              name: "Integrations",
              href: prefixPath(currentEmailAccountId, "/integrations"),
              icon: ZapIcon,
              beta: true,
            },
          ]
        : []),
    ],
    [currentEmailAccountId, showMeetingBriefs, showIntegrations],
  );

  return {
    manageItems,
    cleanupItems,
    moreItems,
  };
};

const topMailLinks: NavItem[] = [
  {
    name: "Inbox",
    icon: InboxIcon,
    href: "?type=inbox",
  },
  {
    name: "Drafts",
    icon: FileIcon,
    href: "?type=draft",
  },
  {
    name: "Sent",
    icon: SendIcon,
    href: "?type=sent",
  },
  {
    name: "Archived",
    icon: ArchiveIcon,
    href: "?type=archive",
  },
];

const bottomMailLinks: NavItem[] = [
  {
    name: "Personal",
    icon: PersonStandingIcon,
    href: "?type=CATEGORY_PERSONAL",
  },
  {
    name: "Social",
    icon: Users2Icon,
    href: "?type=CATEGORY_SOCIAL",
  },
  {
    name: "Updates",
    icon: AlertCircleIcon,
    href: "?type=CATEGORY_UPDATES",
  },
  {
    name: "Forums",
    icon: MessagesSquareIcon,
    href: "?type=CATEGORY_FORUMS",
  },
  {
    name: "Promotions",
    icon: RatioIcon,
    href: "?type=CATEGORY_PROMOTIONS",
  },
];

export function SideNav({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigation = useNavigation();
  const path = usePathname();
  const showMailNav = path.includes("/mail") || path.includes("/compose");
  const isMoreActive = navigation.moreItems.some(
    (item) => path === item.href || path.startsWith(`${item.href}/`),
  );
  const [showMoreItems, setShowMoreItems] = useState(isMoreActive);

  useEffect(() => {
    if (isMoreActive) setShowMoreItems(true);
  }, [isMoreActive]);

  const visibleBottomLinks = useMemo(
    () =>
      showMailNav
        ? [
            {
              name: "Back",
              href: "/automation",
              icon: ArrowLeftIcon,
            },
          ]
        : [],
    [showMailNav],
  );

  const { state } = useSidebar();

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="gap-0 pb-0">
        {state.includes("left-sidebar") ? (
          <div className="flex items-center rounded-md pl-2 pr-0.5 py-3 text-foreground justify-between">
            <Link href="/setup">
              <Logo className="h-3.5" />
            </Link>
            <SidebarTrigger name="left-sidebar" />
          </div>
        ) : (
          <div className="pb-2">
            <SidebarTrigger name="left-sidebar" />
          </div>
        )}
        <AccountSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {state.includes("left-sidebar") ? <SetupProgressCard /> : null}

        <SidebarGroupContent>
          {showMailNav ? (
            <MailNav path={path} />
          ) : (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>Manage</SidebarGroupLabel>
                <SideNavMenu items={navigation.manageItems} activeHref={path} />
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>Cleanup</SidebarGroupLabel>
                <SideNavMenu
                  items={navigation.cleanupItems}
                  activeHref={path}
                />
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <button
                    type="button"
                    className="w-full cursor-pointer gap-1"
                    onClick={() => setShowMoreItems((value) => !value)}
                    aria-expanded={showMoreItems}
                  >
                    {showMoreItems ? (
                      <ChevronDownIcon className="size-3.5" />
                    ) : (
                      <ChevronRightIcon className="size-3.5" />
                    )}
                    <span>Tools</span>
                  </button>
                </SidebarGroupLabel>
                {showMoreItems && (
                  <SideNavMenu items={navigation.moreItems} activeHref={path} />
                )}
              </SidebarGroup>
            </>
          )}
        </SidebarGroupContent>
      </SidebarContent>

      <PremiumCard isCollapsed={!state.includes("left-sidebar")} />

      <SidebarFooter className="pb-4">
        <SideNavMenu items={visibleBottomLinks} activeHref={path} />

        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

function MailNav({ path }: { path: string }) {
  const { onOpen } = useComposeModal();
  const [showHiddenLabels, setShowHiddenLabels] = useState(false);
  const { visibleLabels, hiddenLabels, isLoading } = useSplitLabels();
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);

  // Transform user labels into NavItems
  const labelNavItems = useMemo(() => {
    const searchParams = new URLSearchParams(path.split("?")[1] || "");
    const currentLabelId = searchParams.get("labelId");

    return visibleLabels.map((label) => ({
      name: label.name ?? "",
      icon: TagIcon,
      href: `?type=label&labelId=${encodeURIComponent(label.id ?? "")}`,
      // Add active state for the current label
      active: currentLabelId === label.id,
    }));
  }, [visibleLabels, path]);

  // Transform hidden labels into NavItems
  const hiddenLabelNavItems = useMemo(() => {
    const searchParams = new URLSearchParams(path.split("?")[1] || "");
    const currentLabelId = searchParams.get("labelId");

    return hiddenLabels.map((label) => ({
      name: label.name ?? "",
      icon: TagIcon,
      href: `?type=label&labelId=${encodeURIComponent(label.id ?? "")}`,
      // Add active state for the current label
      active: currentLabelId === label.id,
    }));
  }, [hiddenLabels, path]);

  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-9 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              onClick={onOpen}
              sidebarName="left-sidebar"
            >
              <PenIcon className="size-4" />
              <span className="truncate font-semibold">Compose</span>
              <CommandShortcut>C</CommandShortcut>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>
        <SideNavMenu items={topMailLinks} activeHref={path} />
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Categories</SidebarGroupLabel>
        <SideNavMenu items={bottomMailLinks} activeHref={path} />
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>
          {terminology.label.pluralCapitalized}
        </SidebarGroupLabel>
        <LoadingContent loading={isLoading}>
          {visibleLabels.length > 0 ? (
            <SideNavMenu items={labelNavItems} activeHref={path} />
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No {terminology.label.plural}
            </div>
          )}

          {/* Hidden labels toggle */}
          {hiddenLabels.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowHiddenLabels(!showHiddenLabels)}
                className="flex w-full items-center px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {showHiddenLabels ? (
                  <ChevronDownIcon className="mr-1 size-4" />
                ) : (
                  <ChevronRightIcon className="mr-1 size-4" />
                )}
                <span>More</span>
              </button>

              {showHiddenLabels && (
                <SideNavMenu items={hiddenLabelNavItems} activeHref={path} />
              )}
            </>
          )}
        </LoadingContent>
      </SidebarGroup>
    </>
  );
}
