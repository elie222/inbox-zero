"use client";

import { useMemo } from "react";
import Image from "next/image";
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
                <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">
                Add account
              </div>
            </DropdownMenuItem>
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
