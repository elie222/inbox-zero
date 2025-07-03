"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  AlertCircleIcon,
  ArchiveIcon,
  ArrowLeftIcon,
  BarChartBigIcon,
  BookIcon,
  BrushIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CogIcon,
  CrownIcon,
  FileIcon,
  GiftIcon,
  InboxIcon,
  type LucideIcon,
  MailsIcon,
  MessageCircleReplyIcon,
  MessagesSquareIcon,
  PenIcon,
  PersonStandingIcon,
  RatioIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TagIcon,
  Users2Icon,
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
} from "@/components/ui/sidebar";
import { SideNavMenu } from "@/components/SideNavMenu";
import { CommandShortcut } from "@/components/ui/command";
import { useSplitLabels } from "@/hooks/useLabels";
import { LoadingContent } from "@/components/LoadingContent";
import { useCleanerEnabled } from "@/hooks/useFeatureFlags";
import { ClientOnly } from "@/components/ClientOnly";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { ReferralDialog } from "@/components/ReferralDialog";

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon | ((props: any) => React.ReactNode);
  target?: "_blank";
  count?: number;
  hideInMail?: boolean;
};

export const useNavigation = () => {
  // When we have features in early access, we can filter the navigation items
  const showCleaner = useCleanerEnabled();
  const { emailAccountId } = useAccount();
  const { provider } = useAccount();

  // Assistant category items
  const assistantItems: NavItem[] = useMemo(
    () => [
      {
        name: "Assistant",
        href: prefixPath(emailAccountId, "/automation"),
        icon: SparklesIcon,
      },
      ...(provider === "google"
        ? [
            {
              name: "Reply Zero",
              href: prefixPath(emailAccountId, "/reply-zero"),
              icon: MessageCircleReplyIcon,
            },
            {
              name: "Cold Emails",
              href: prefixPath(emailAccountId, "/cold-email-blocker"),
              icon: ShieldCheckIcon,
            },
          ]
        : []),
    ],
    [emailAccountId, provider],
  );

  // Clean category items
  const cleanItems: NavItem[] = useMemo(
    () => [
      {
        name: "Bulk Unsubscribe",
        href: prefixPath(emailAccountId, "/bulk-unsubscribe"),
        icon: MailsIcon,
      },
      ...(provider === "google"
        ? [
            {
              name: "Deep Clean",
              href: prefixPath(emailAccountId, "/clean"),
              icon: BrushIcon,
            },
            {
              name: "Analytics",
              href: prefixPath(emailAccountId, "/stats"),
              icon: BarChartBigIcon,
            },
          ]
        : []),
    ],
    [emailAccountId, provider],
  );

  const cleanItemsFiltered = useMemo(
    () =>
      cleanItems.filter((item) => {
        if (item.href === `/${emailAccountId}/clean` || item.href === "/clean")
          return showCleaner;
        return true;
      }),
    [showCleaner, emailAccountId, cleanItems],
  );

  return {
    assistantItems,
    cleanItems: cleanItemsFiltered,
  };
};

const bottomLinks: NavItem[] = [
  {
    name: "Help Center",
    href: "https://docs.getinboxzero.com",
    target: "_blank",
    icon: BookIcon,
  },
  {
    name: "Follow on X",
    href: "/twitter",
    target: "_blank",
    icon: (props: any) => (
      <svg
        width="100"
        height="100"
        viewBox="0 0 24 24"
        {...props}
        aria-label="X"
      >
        <title>X</title>
        <path
          fill="currentColor"
          d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"
        />
      </svg>
    ),
    hideInMail: true,
  },
  {
    name: "Join Discord",
    href: "/discord",
    target: "_blank",
    icon: (props: any) => (
      <svg
        width="100"
        height="100"
        viewBox="0 0 24 24"
        {...props}
        aria-label="Discord"
      >
        <title>Discord</title>
        <path
          fill="currentColor"
          d="M 9.1367188 3.8691406 C 9.1217187 3.8691406 9.1067969 3.8700938 9.0917969 3.8710938 C 8.9647969 3.8810937 5.9534375 4.1403594 4.0234375 5.6933594 C 3.0154375 6.6253594 1 12.073203 1 16.783203 C 1 16.866203 1.0215 16.946531 1.0625 17.019531 C 2.4535 19.462531 6.2473281 20.102859 7.1113281 20.130859 L 7.1269531 20.130859 C 7.2799531 20.130859 7.4236719 20.057594 7.5136719 19.933594 L 8.3886719 18.732422 C 6.0296719 18.122422 4.8248594 17.086391 4.7558594 17.025391 C 4.5578594 16.850391 4.5378906 16.549563 4.7128906 16.351562 C 4.8068906 16.244563 4.9383125 16.189453 5.0703125 16.189453 C 5.1823125 16.189453 5.2957188 16.228594 5.3867188 16.308594 C 5.4157187 16.334594 7.6340469 18.216797 11.998047 18.216797 C 16.370047 18.216797 18.589328 16.325641 18.611328 16.306641 C 18.702328 16.227641 18.815734 16.189453 18.927734 16.189453 C 19.059734 16.189453 19.190156 16.243562 19.285156 16.351562 C 19.459156 16.549563 19.441141 16.851391 19.244141 17.025391 C 19.174141 17.087391 17.968375 18.120469 15.609375 18.730469 L 16.484375 19.933594 C 16.574375 20.057594 16.718094 20.130859 16.871094 20.130859 L 16.886719 20.130859 C 17.751719 20.103859 21.5465 19.463531 22.9375 17.019531 C 22.9785 16.947531 23 16.866203 23 16.783203 C 23 12.073203 20.984172 6.624875 19.951172 5.671875 C 18.047172 4.140875 15.036203 3.8820937 14.908203 3.8710938 C 14.895203 3.8700938 14.880188 3.8691406 14.867188 3.8691406 C 14.681188 3.8691406 14.510594 3.9793906 14.433594 4.1503906 C 14.427594 4.1623906 14.362062 4.3138281 14.289062 4.5488281 C 15.548063 4.7608281 17.094141 5.1895937 18.494141 6.0585938 C 18.718141 6.1975938 18.787437 6.4917969 18.648438 6.7167969 C 18.558438 6.8627969 18.402188 6.9433594 18.242188 6.9433594 C 18.156188 6.9433594 18.069234 6.9200937 17.990234 6.8710938 C 15.584234 5.3800938 12.578 5.3046875 12 5.3046875 C 11.422 5.3046875 8.4157187 5.3810469 6.0117188 6.8730469 C 5.9327188 6.9210469 5.8457656 6.9433594 5.7597656 6.9433594 C 5.5997656 6.9433594 5.4425625 6.86475 5.3515625 6.71875 C 5.2115625 6.49375 5.2818594 6.1985938 5.5058594 6.0585938 C 6.9058594 5.1905937 8.4528906 4.7627812 9.7128906 4.5507812 C 9.6388906 4.3147813 9.5714062 4.1643437 9.5664062 4.1523438 C 9.4894063 3.9813438 9.3217188 3.8691406 9.1367188 3.8691406 z M 12 7.3046875 C 12.296 7.3046875 14.950594 7.3403125 16.933594 8.5703125 C 17.326594 8.8143125 17.777234 8.9453125 18.240234 8.9453125 C 18.633234 8.9453125 19.010656 8.8555 19.347656 8.6875 C 19.964656 10.2405 20.690828 12.686219 20.923828 15.199219 C 20.883828 15.143219 20.840922 15.089109 20.794922 15.037109 C 20.324922 14.498109 19.644687 14.191406 18.929688 14.191406 C 18.332687 14.191406 17.754078 14.405437 17.330078 14.773438 C 17.257078 14.832437 15.505 16.21875 12 16.21875 C 8.496 16.21875 6.7450313 14.834687 6.7070312 14.804688 C 6.2540312 14.407687 5.6742656 14.189453 5.0722656 14.189453 C 4.3612656 14.189453 3.6838438 14.494391 3.2148438 15.025391 C 3.1658438 15.080391 3.1201719 15.138266 3.0761719 15.197266 C 3.3091719 12.686266 4.0344375 10.235594 4.6484375 8.6835938 C 4.9864375 8.8525938 5.3657656 8.9433594 5.7597656 8.9433594 C 6.2217656 8.9433594 6.6724531 8.8143125 7.0644531 8.5703125 C 9.0494531 7.3393125 11.704 7.3046875 12 7.3046875 z M 8.890625 10.044922 C 7.966625 10.044922 7.2167969 10.901031 7.2167969 11.957031 C 7.2167969 13.013031 7.965625 13.869141 8.890625 13.869141 C 9.815625 13.869141 10.564453 13.013031 10.564453 11.957031 C 10.564453 10.900031 9.815625 10.044922 8.890625 10.044922 z M 15.109375 10.044922 C 14.185375 10.044922 13.435547 10.901031 13.435547 11.957031 C 13.435547 13.013031 14.184375 13.869141 15.109375 13.869141 C 16.034375 13.869141 16.783203 13.013031 16.783203 11.957031 C 16.783203 10.900031 16.033375 10.044922 15.109375 10.044922 z"
        />
      </svg>
    ),
    hideInMail: true,
  },
  { name: "Premium", href: "/premium", icon: CrownIcon },
  { name: "Settings", href: "/settings", icon: CogIcon },
];

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

  const visibleBottomLinks = useMemo(
    () =>
      showMailNav
        ? [
            {
              name: "Back",
              href: "/automation",
              icon: ArrowLeftIcon,
            },
            ...bottomLinks.filter((l) => !l.hideInMail),
          ]
        : bottomLinks,
    [showMailNav],
  );

  const { state } = useSidebar();

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="gap-0 pb-0">
        {state === "expanded" ? (
          <Link href="/setup">
            <div className="flex items-center rounded-md p-3 text-foreground">
              <Logo className="h-3.5" />
            </div>
          </Link>
        ) : null}
        <AccountSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroupContent>
          {showMailNav ? (
            <MailNav path={path} />
          ) : (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>Assistant</SidebarGroupLabel>
                <SideNavMenu
                  items={navigation.assistantItems}
                  activeHref={path}
                />
              </SidebarGroup>
              {navigation.cleanItems.length > 0 && (
                <SidebarGroup>
                  <SidebarGroupLabel>Clean</SidebarGroupLabel>
                  <ClientOnly>
                    <SideNavMenu
                      items={navigation.cleanItems}
                      activeHref={path}
                    />
                  </ClientOnly>
                </SidebarGroup>
              )}
            </>
          )}
        </SidebarGroupContent>
      </SidebarContent>

      <SidebarFooter className="pb-4">
        <ClientOnly>
          <ReferralDialog />
        </ClientOnly>

        <SideNavMenu items={visibleBottomLinks} activeHref={path} />
      </SidebarFooter>
    </Sidebar>
  );
}

function MailNav({ path }: { path: string }) {
  const { onOpen } = useComposeModal();
  const [showHiddenLabels, setShowHiddenLabels] = useState(false);
  const { visibleLabels, hiddenLabels, isLoading } = useSplitLabels();

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
        <SidebarGroupLabel>Labels</SidebarGroupLabel>
        <LoadingContent loading={isLoading}>
          {visibleLabels.length > 0 ? (
            <SideNavMenu items={labelNavItems} activeHref={path} />
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No labels
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
