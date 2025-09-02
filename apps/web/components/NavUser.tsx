"use client";

import Link from "next/link";
import {
  ChevronsUpDownIcon,
  BarChartIcon,
  InboxIcon,
  MessageCircleReplyIcon,
  ShieldCheckIcon,
  RibbonIcon,
  LogOutIcon,
  PaletteIcon,
  SettingsIcon,
  CrownIcon,
  ChromeIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { logOut } from "@/utils/user";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { useTheme } from "next-themes";
import { ProfileImage } from "@/components/ProfileImage";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EXTENSION_URL } from "@/utils/config";

export function NavUser() {
  const { emailAccountId, emailAccount, provider } = useAccount();
  const { theme, setTheme } = useTheme();

  return (
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
              {emailAccount?.name?.charAt(0) || emailAccount?.email?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          {emailAccount ? (
            <>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {emailAccount.name || emailAccount.email}
                </span>
                <span className="truncate text-xs">{emailAccount.email}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </>
          ) : null}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-52 origin-top-right rounded-md"
        side="bottom"
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <ProfileImage
              image={emailAccount?.image || null}
              label={emailAccount?.name || emailAccount?.email || ""}
              size={32}
            />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {emailAccount?.name || emailAccount?.email || "Account"}
              </span>
              <span className="truncate text-xs">
                {emailAccount?.email || "Account"}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={prefixPath(emailAccountId, "/settings")}>
              <SettingsIcon className="mr-2 size-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          {isGoogleProvider(provider) && (
            <DropdownMenuItem asChild>
              <Link
                href={EXTENSION_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ChromeIcon className="mr-2 size-4" />
                Install extension
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href="/premium">
              <CrownIcon className="mr-2 size-4" />
              Premium
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={prefixPath(emailAccountId, "/usage")}>
              <BarChartIcon className="mr-2 size-4" />
              Usage
            </Link>
          </DropdownMenuItem>

          {isGoogleProvider(provider) && (
            <>
              <DropdownMenuItem asChild>
                <Link href={prefixPath(emailAccountId, "/mail")}>
                  <InboxIcon className="mr-2 size-4" />
                  Mail (Beta)
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={prefixPath(emailAccountId, "/reply-zero")}>
                  <MessageCircleReplyIcon className="mr-2 size-4" />
                  Reply Zero
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={prefixPath(emailAccountId, "/cold-email-blocker")}>
                  <ShieldCheckIcon className="mr-2 size-4" />
                  Cold Email Blocker
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/early-access">
                  <RibbonIcon className="mr-2 size-4" />
                  Early Access
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setTheme(theme === "dark" ? "light" : "dark");
          }}
        >
          <PaletteIcon className="mr-2 size-4" />
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logOut(window.location.origin)}>
          <LogOutIcon className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
