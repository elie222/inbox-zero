"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { ProfileImage } from "@/components/ProfileImage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { cn } from "@/utils";
import { redirectToSafeUrl } from "@/utils/redirect";

export function MailAccountSwitcher({
  isAllAccounts,
  onSelectAll,
  variant,
}: {
  isAllAccounts: boolean;
  onSelectAll: () => void;
  variant: "compact" | "sidebar";
}) {
  const { data } = useAccounts();
  const { emailAccount } = useAccount();

  if (!data) return null;

  const activeLabel = isAllAccounts
    ? "All accounts"
    : emailAccount?.name || emailAccount?.email || "Choose account";
  const activeEmail =
    !isAllAccounts && emailAccount?.name ? emailAccount.email : null;
  let activeIcon: ReactNode = null;
  if (isAllAccounts) {
    activeIcon = <AllAccountsIcon />;
  } else if (emailAccount) {
    activeIcon = (
      <ProfileImage
        className="size-8"
        image={emailAccount.image}
        label={emailAccount.name || emailAccount.email}
      />
    );
  }

  return (
    <div
      className={cn(
        "shrink-0 border-border border-t pt-2",
        variant === "compact"
          ? "bg-background px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
          : "mt-2 hidden lg:block",
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              variant === "compact" ? "h-11" : "h-10",
            )}
          >
            {activeIcon}
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate font-medium text-sm">
                {activeLabel}
              </span>
              {activeEmail ? (
                <span className="block truncate text-muted-foreground text-xs">
                  {activeEmail}
                </span>
              ) : null}
            </span>
            <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className={cn(
            "rounded-2xl p-2 shadow-xl",
            variant === "compact"
              ? "w-[calc(100vw-1.5rem)]"
              : "w-[--radix-dropdown-menu-trigger-width] min-w-72",
          )}
          side="top"
          sideOffset={8}
        >
          {data.emailAccounts.length > 1 ? (
            <DropdownMenuItem
              className="gap-3 rounded-xl p-3"
              onSelect={onSelectAll}
            >
              <AllAccountsIcon />
              <span className="font-medium">All accounts</span>
            </DropdownMenuItem>
          ) : null}
          {data.emailAccounts.map((account) => (
            <AccountItem account={account} key={account.id} />
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="gap-3 rounded-xl p-3">
            <Link href="/accounts">
              <span className="flex size-8 items-center justify-center rounded-full bg-muted">
                <PlusIcon className="size-4" />
              </span>
              <span className="font-medium text-muted-foreground">
                Add or manage accounts
              </span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function AccountItem({
  account,
}: {
  account: GetEmailAccountsResponse["emailAccounts"][number];
}) {
  return (
    <DropdownMenuItem
      className="gap-3 rounded-xl p-3"
      onSelect={() => {
        const params = new URLSearchParams(window.location.search);
        params.delete("accountScope");
        params.delete("thread-id");
        const query = params.toString();
        redirectToSafeUrl(`/${account.id}/mail${query ? `?${query}` : ""}`);
      }}
    >
      <ProfileImage
        className="size-10"
        image={account.image}
        label={account.name || account.email}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {account.name || account.email}
        </span>
        {account.name ? (
          <span className="block truncate text-muted-foreground text-xs">
            {account.email}
          </span>
        ) : null}
      </span>
    </DropdownMenuItem>
  );
}

function AllAccountsIcon() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center gap-0.5 rounded-full bg-muted">
      <span className="size-2 rounded-full bg-blue-600" />
      <span className="size-2 rounded-full bg-violet-500" />
      <span className="size-2 rounded-full bg-emerald-500" />
    </span>
  );
}
