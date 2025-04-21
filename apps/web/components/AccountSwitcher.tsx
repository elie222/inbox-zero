"use client";

import { useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useHotkeys } from "react-hotkeys-hook";
import { useQueryState } from "nuqs";
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
import type { GetAccountsResponse } from "@/app/api/user/accounts/route";
import { useModifierKey } from "@/hooks/useModifierKey";

export function AccountSwitcher() {
  const { data: accountsData } = useAccounts();
  const [accountId, setAccountId] = useQueryState("accountId");

  return (
    <AccountSwitcherInternal
      accounts={accountsData?.accounts ?? []}
      accountId={accountId}
      setAccountId={setAccountId}
    />
  );
}

export function AccountSwitcherInternal({
  accounts,
  accountId,
  setAccountId,
}: {
  accounts: GetAccountsResponse["accounts"];
  accountId: string | null;
  setAccountId: (accountId: string) => void;
}) {
  const { isMobile } = useSidebar();
  const { symbol: modifierSymbol } = useModifierKey();

  useAccountHotkeys(accounts, setAccountId);

  const activeAccount = useMemo(
    () =>
      accounts.find((account) => account.accountId === accountId) ||
      accounts?.[0],
    [accounts, accountId],
  );

  if (!activeAccount) return null;

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
                <ProfileImage image={activeAccount.user.image} />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {activeAccount.user.name}
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
            {accounts.map((account, index) => (
              <DropdownMenuItem
                key={account.accountId}
                onClick={() => setAccountId(account.accountId)}
                className="gap-2 p-2"
              >
                <ProfileImage image={account.user.image} />
                <span className="truncate">{account.user.name}</span>
                <DropdownMenuShortcut>
                  {modifierSymbol}
                  {index + 1}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
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
}: { image: string | null; size?: number }) {
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
  accounts: GetAccountsResponse["accounts"],
  setAccountId: (accountId: string) => void,
) {
  const { isMac } = useModifierKey();
  const modifierKey = isMac ? "meta" : "ctrl";

  const accountShortcuts = useMemo(() => {
    return accounts.slice(0, 9).map((account, index) => ({
      hotkey: `${modifierKey}+${index + 1}`,
      accountId: account.accountId,
    }));
  }, [accounts, modifierKey]);

  const hotkeyHandler = useCallback(
    (event: KeyboardEvent) => {
      const pressedDigit = Number.parseInt(event.key, 10);
      if (
        !Number.isNaN(pressedDigit) &&
        pressedDigit >= 1 &&
        pressedDigit <= 9
      ) {
        const accountIndex = pressedDigit - 1;
        if (accounts[accountIndex]) {
          setAccountId(accounts[accountIndex].accountId);
          event.preventDefault(); // Prevent browser default behavior
        }
      }
    },
    [accounts, setAccountId],
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
