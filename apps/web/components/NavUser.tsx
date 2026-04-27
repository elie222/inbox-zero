"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CircleHelpIcon,
  ChevronsUpDownIcon,
  LightbulbIcon,
  MessageCircleReplyIcon,
  ShieldCheckIcon,
  LogOutIcon,
  Building2Icon,
  CrownIcon,
  GiftIcon,
  GlobeIcon,
  SettingsIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { logOut } from "@/utils/user";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EXTENSION_URL } from "@/utils/config";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";
import { env } from "@/env";
import { Referrals } from "@/components/ReferralDialog";

export function NavUser() {
  const { emailAccountId, emailAccount, provider } = useAccount();
  const { closeMobileSidebar, isMobile, state } = useSidebar();
  const [isReferralDialogOpen, setIsReferralDialogOpen] = useState(false);

  const currentEmailAccountId = emailAccount?.id || emailAccountId;
  const organization = useCurrentOrganization();
  const hasOrganization = !!organization;
  const organizationName = organization?.name;

  const isExpandedSidebar = state.includes("left-sidebar");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage
                src={emailAccount?.image || ""}
                alt={emailAccount?.name || emailAccount?.email}
              />
              <AvatarFallback className="rounded-lg">
                {emailAccount?.name?.charAt(0) ||
                  emailAccount?.email?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            {emailAccount ? (
              <>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {emailAccount.name || emailAccount.email}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {organizationName || emailAccount.email}
                  </span>
                </div>
                <ChevronsUpDownIcon className="ml-auto size-4" />
              </>
            ) : null}
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-52 rounded-md md:data-[side=top]:w-[--radix-dropdown-menu-trigger-width]"
          side={isMobile ? "bottom" : isExpandedSidebar ? "top" : "right"}
          align={isExpandedSidebar ? "start" : "end"}
          sideOffset={4}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link
                href="/settings"
                onClick={() => closeMobileSidebar("left-sidebar")}
              >
                <SettingsIcon className="mr-2 size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            {!hasOrganization && (
              <DropdownMenuItem asChild>
                <Link
                  href={prefixPath(
                    currentEmailAccountId,
                    "/organization/create",
                  )}
                  onClick={() => closeMobileSidebar("left-sidebar")}
                >
                  <Building2Icon className="mr-2 size-4" />
                  Create organization
                </Link>
              </DropdownMenuItem>
            )}
            {hasOrganization && (
              <DropdownMenuItem asChild>
                <Link
                  href={prefixPath(currentEmailAccountId, "/organization")}
                  onClick={() => closeMobileSidebar("left-sidebar")}
                >
                  <Building2Icon className="mr-2 size-4" />
                  My Organization
                </Link>
              </DropdownMenuItem>
            )}
            {isGoogleProvider(provider) && (
              <DropdownMenuItem asChild>
                <Link
                  href={EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => closeMobileSidebar("left-sidebar")}
                >
                  <GlobeIcon className="mr-2 size-4" />
                  Install extension
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            {isGoogleProvider(provider) && (
              <>
                <DropdownMenuItem asChild>
                  <Link
                    href={prefixPath(currentEmailAccountId, "/reply-zero")}
                    onClick={() => closeMobileSidebar("left-sidebar")}
                  >
                    <MessageCircleReplyIcon className="mr-2 size-4" />
                    Reply Zero
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={prefixPath(
                      currentEmailAccountId,
                      "/cold-email-blocker",
                    )}
                    onClick={() => closeMobileSidebar("left-sidebar")}
                  >
                    <ShieldCheckIcon className="mr-2 size-4" />
                    Cold Email Blocker
                  </Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            {!env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS && (
              <DropdownMenuItem asChild>
                <Link
                  href="/premium"
                  onClick={() => closeMobileSidebar("left-sidebar")}
                >
                  <CrownIcon className="mr-2 size-4" />
                  Premium
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link
                href="https://docs.getinboxzero.com"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => closeMobileSidebar("left-sidebar")}
              >
                <CircleHelpIcon className="mr-2 size-4" />
                Help Center
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/feature-requests"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => closeMobileSidebar("left-sidebar")}
              >
                <LightbulbIcon className="mr-2 size-4" />
                Feature Requests
              </Link>
            </DropdownMenuItem>
            {!env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS && (
              <DropdownMenuItem
                onSelect={() => {
                  closeMobileSidebar("left-sidebar");
                  setIsReferralDialogOpen(true);
                }}
              >
                <GiftIcon className="mr-2 size-4" />
                Refer a Friend
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              closeMobileSidebar("left-sidebar");
              logOut(window.location.origin);
            }}
          >
            <LogOutIcon className="mr-2 size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isReferralDialogOpen}
        onOpenChange={setIsReferralDialogOpen}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <Referrals />
        </DialogContent>
      </Dialog>
    </>
  );
}
