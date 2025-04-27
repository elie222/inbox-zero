"use client";

import { useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useHotkeys } from "react-hotkeys-hook";
import { ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAccounts } from "@/hooks/useAccounts";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { useModifierKey } from "@/hooks/useModifierKey";
import { useAccount } from "@/providers/EmailAccountProvider";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function AccountSwitcher() {
  const { data: accountsData } = useAccounts();

  return (
    <AccountSwitcherInternal
      emailAccounts={accountsData?.emailAccounts ?? []}
    />
  );
}

export function AccountSwitcherInternal({
  emailAccounts,
}: {
  emailAccounts: GetEmailAccountsResponse["emailAccounts"];
}) {
  const { isMobile } = useSidebar();
  const { symbol: modifierSymbol } = useModifierKey();

  const {
    emailAccountId: activeEmailAccountId,
    emailAccount: activeEmailAccount,
    isLoading,
  } = useAccount();

  const pathname = usePathname();
  const searchParams = useSearchParams();

  const getHref = useCallback(
    (emailAccountId: string) => {
      if (!activeEmailAccountId) return `/${emailAccountId}`;

      const basePath = pathname.split("?")[0] || "/";
      const newBasePath = basePath.replace(
        activeEmailAccountId,
        emailAccountId,
      );

      const tab = searchParams.get("tab");

      return `${newBasePath}${tab ? `?tab=${tab}` : ""}`;
    },
    [pathname, activeEmailAccountId, searchParams],
  );

  useAccountHotkeys(emailAccounts, getHref);

  if (isLoading) return null;
  if (!activeEmailAccountId || !activeEmailAccount) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center">
                <ProfileImage image={activeEmailAccount.user.image} />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {activeEmailAccount.user.name}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Accounts
            </DropdownMenuLabel>
            {emailAccounts.map((emailAccount, index) => (
              <Link href={getHref(emailAccount.id)} key={emailAccount.id}>
                <DropdownMenuItem key={emailAccount.id} className="gap-2 p-2">
                  <ProfileImage image={emailAccount.user.image} />
                  <span className="truncate">{emailAccount.user.name}</span>
                  <DropdownMenuShortcut>
                    {modifierSymbol}
                    {index + 1}
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
              </Link>
            ))}
            <DropdownMenuSeparator />
            <Link href="/add-account">
              <DropdownMenuItem className="gap-2 p-2">
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <Plus className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">
                  Add account
                </div>
              </DropdownMenuItem>
            </Link>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function ProfileImage({
  image,
  size = 24,
}: {
  image: string | null;
  size?: number;
}) {
  if (!image) return null;

  return (
    <Image
      width={size}
      height={size}
      className="rounded-full"
      src={image}
      alt=""
    />
  );
}

function useAccountHotkeys(
  emailAccounts: GetEmailAccountsResponse["emailAccounts"],
  getHref: (emailAccountId: string) => string,
) {
  const router = useRouter();
  const { isMac } = useModifierKey();
  const modifierKey = isMac ? "meta" : "ctrl";

  const accountShortcuts = useMemo(() => {
    return emailAccounts.slice(0, 9).map((emailAccount, index) => ({
      hotkey: `${modifierKey}+${index + 1}`,
      emailAccountId: emailAccount.id,
    }));
  }, [emailAccounts, modifierKey]);

  const hotkeyHandler = useCallback(
    (event: KeyboardEvent) => {
      const pressedDigit = Number.parseInt(event.key, 10);
      if (
        !Number.isNaN(pressedDigit) &&
        pressedDigit >= 1 &&
        pressedDigit <= 9
      ) {
        const accountIndex = pressedDigit - 1;
        if (emailAccounts[accountIndex]) {
          router.push(getHref(emailAccounts[accountIndex].id));
          event.preventDefault(); // Prevent browser default behavior
        }
      }
    },
    [emailAccounts, getHref, router],
  );

  useHotkeys(
    accountShortcuts.map((s) => s.hotkey).join(","),
    hotkeyHandler,
    {
      preventDefault: true, // Keep for good measure, though handled in callback
    },
    [accountShortcuts, hotkeyHandler], // Dependencies for useHotkeys
  );
}
