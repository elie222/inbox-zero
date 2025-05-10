"use client";

import { useMemo, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { ProfileImage } from "@/components/ProfileImage";

export function AccountSwitcher() {
  const { data: accountsData } = useAccounts();

  if (!accountsData) return null;

  return <AccountSwitcherInternal emailAccounts={accountsData.emailAccounts} />;
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
      if (!activeEmailAccountId) return `/${emailAccountId}/setup`;

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

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {activeEmailAccount ? (
                <>
                  <div className="flex aspect-square size-8 items-center justify-center">
                    <ProfileImage
                      image={activeEmailAccount.image}
                      label={
                        activeEmailAccount.name || activeEmailAccount.email
                      }
                    />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {activeEmailAccount.name || activeEmailAccount.email}
                    </span>
                    {activeEmailAccount.name && (
                      <span className="truncate text-xs text-muted-foreground">
                        {activeEmailAccount.email}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div>Choose account</div>
              )}
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-80 rounded-lg"
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
                  <ProfileImage
                    image={emailAccount.image}
                    label={emailAccount.name || emailAccount.email}
                  />
                  <div className="flex flex-col">
                    <span className="truncate font-medium">
                      {emailAccount.name || emailAccount.email}
                    </span>
                    {emailAccount.name && (
                      <span className="truncate text-xs text-muted-foreground">
                        {emailAccount.email}
                      </span>
                    )}
                  </div>
                  <DropdownMenuShortcut>
                    {modifierSymbol}
                    {index + 1}
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
              </Link>
            ))}
            <DropdownMenuSeparator />
            <Link href="/accounts">
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
