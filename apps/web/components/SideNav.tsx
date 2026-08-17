"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useQueryState } from "nuqs";
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
  MicIcon,
  PenIcon,
  PersonStandingIcon,
  RatioIcon,
  SendIcon,
  SparklesIcon,
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
import type { EmailLabel } from "@/providers/email-label-types";
import { LoadingContent } from "@/components/LoadingContent";
import {
  useCleanerEnabled,
  useIntegrationsEnabled,
  useMeetingBriefsEnabled,
  useMeetingRecorderEnabled,
} from "@/hooks/useFeatureFlags";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { NavUser } from "@/components/NavUser";
import { PremiumCard } from "@/components/PremiumCard";
import { FeedbackDialog } from "@/components/FeedbackDialog";

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon | (() => React.ReactNode);
  target?: "_blank";
  count?: number;
  hideInMail?: boolean;
  active?: boolean;
  beta?: boolean;
  new?: boolean;
};

export const useNavigation = () => {
  const showCleaner = useCleanerEnabled();
  const showMeetingBriefs = useMeetingBriefsEnabled();
  const showMeetingRecorder = useMeetingRecorderEnabled();
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
      ...(showMeetingRecorder
        ? [
            {
              name: "Meetings",
              href: prefixPath(currentEmailAccountId, "/meetings"),
              icon: MicIcon,
              beta: true,
            },
          ]
        : []),
    ],
    [currentEmailAccountId, showMeetingRecorder],
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
            },
          ]
        : []),
    ],
    [currentEmailAccountId, showMeetingBriefs, showIntegrations],
  );

  return {
    homeHref: prefixPath(currentEmailAccountId, "/automation"),
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

export function SideNav({
  feedbackEnabled,
  ...props
}: React.ComponentProps<typeof Sidebar> & { feedbackEnabled: boolean }) {
  const navigation = useNavigation();
  const path = usePathname();
  const showMailNav = path.includes("/compose");
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
          <div className="flex items-center rounded-md pl-2 pr-0.5 py-3 text-foreground">
            <Link href={navigation.homeHref} data-hide-on-desktop-mac>
              <Logo className="h-3.5" />
            </Link>
            <SidebarTrigger name="left-sidebar" className="ml-auto" />
          </div>
        ) : (
          <div className="pb-2 pt-[var(--desktop-traffic-lights-height,0px)]">
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

        {feedbackEnabled && (
          <SidebarMenu>
            <SidebarMenuItem>
              <FeedbackDialog />
            </SidebarMenuItem>
          </SidebarMenu>
        )}

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

  const [currentType] = useQueryState("type");
  const [currentLabelId] = useQueryState("labelId");
  // The mail page defaults to the inbox when no type is selected
  const activeType = currentLabelId ? null : (currentType ?? "inbox");

  const labelNavItems = useMemo(
    () => visibleLabels.map((label) => labelToNavItem(label, currentLabelId)),
    [visibleLabels, currentLabelId],
  );

  const hiddenLabelNavItems = useMemo(
    () => hiddenLabels.map((label) => labelToNavItem(label, currentLabelId)),
    [hiddenLabels, currentLabelId],
  );

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
        <SideNavMenu
          items={markActiveType(topMailLinks, activeType)}
          activeHref={path}
        />
      </SidebarGroup>
      {isGoogleProvider(provider) && (
        <SidebarGroup>
          <SidebarGroupLabel>Categories</SidebarGroupLabel>
          <SideNavMenu
            items={markActiveType(bottomMailLinks, activeType)}
            activeHref={path}
          />
        </SidebarGroup>
      )}

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

function markActiveType(items: NavItem[], activeType: string | null) {
  return items.map((item) => ({
    ...item,
    active: item.href === `?type=${activeType}`,
  }));
}

function labelToNavItem(
  label: EmailLabel,
  currentLabelId: string | null,
): NavItem {
  return {
    name: label.name,
    icon: () => (
      <span
        className="size-2.5 shrink-0 rounded-full"
        // Match Gmail/Outlook: labels without an assigned color are gray
        style={{
          backgroundColor: label.color?.backgroundColor || "#9CA3AF",
        }}
      />
    ),
    href: `?type=label&labelId=${encodeURIComponent(label.id)}`,
    active: currentLabelId === label.id,
  };
}
