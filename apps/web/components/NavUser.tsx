"use client";

import Link from "next/link";
import {
  CircleHelpIcon,
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { logOut } from "@/utils/user";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { useSidebar } from "@/components/ui/sidebar";
import { EXTENSION_URL } from "@/utils/config";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";
import { env } from "@/env";

// The account/settings half of the sidebar identity menu — rendered inside
// the account switcher's dropdown so the sidebar shows ONE user chip, not
// two. The referral dialog lives with the dropdown host (it can't mount
// inside the menu, which unmounts on close).
export function UserMenuItems({
  onOpenReferrals,
}: {
  onOpenReferrals: () => void;
}) {
  const { emailAccountId, emailAccount, provider } = useAccount();
  const { closeMobileSidebar } = useSidebar();

  const currentEmailAccountId = emailAccount?.id || emailAccountId;
  const organization = useCurrentOrganization();
  const hasOrganization = !!organization;

  const closeSidebar = () => closeMobileSidebar("left-sidebar");

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link href="/settings" onClick={closeSidebar}>
            <SettingsIcon className="mr-2 size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        {!hasOrganization && (
          <DropdownMenuItem asChild>
            <Link
              href={prefixPath(currentEmailAccountId, "/organization/create")}
              onClick={closeSidebar}
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
              onClick={closeSidebar}
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
              onClick={closeSidebar}
            >
              <GlobeIcon className="mr-2 size-4" />
              Install extension
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>

      {isGoogleProvider(provider) && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link
                href={prefixPath(currentEmailAccountId, "/reply-zero")}
                onClick={closeSidebar}
              >
                <MessageCircleReplyIcon className="mr-2 size-4" />
                Reply Zero
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={prefixPath(currentEmailAccountId, "/cold-email-blocker")}
                onClick={closeSidebar}
              >
                <ShieldCheckIcon className="mr-2 size-4" />
                Cold Email Blocker
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </>
      )}

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        {!env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS && (
          <DropdownMenuItem asChild>
            <Link href="/premium" onClick={closeSidebar}>
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
            onClick={closeSidebar}
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
            onClick={closeSidebar}
          >
            <LightbulbIcon className="mr-2 size-4" />
            Feature Requests
          </Link>
        </DropdownMenuItem>
        {!env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS && (
          <DropdownMenuItem
            onSelect={() => {
              closeSidebar();
              onOpenReferrals();
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
          closeSidebar();
          logOut(window.location.origin);
        }}
      >
        <LogOutIcon className="mr-2 size-4" />
        Sign out
      </DropdownMenuItem>
    </>
  );
}
