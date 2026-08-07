"use client";

import Link from "next/link";
import { ChevronDownIcon, LogOutIcon, PlusIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccount } from "@/providers/EmailAccountProvider";
import { setLastEmailAccountAction } from "@/utils/actions/email-account-cookie";
import { redirectToSafeUrl } from "@/utils/redirect";
import { logOut } from "@/utils/user";

// Wrong-account escape hatch for the onboarding header: people sometimes sign
// up with the wrong account and must be able to get out without finishing.
export function OnboardingAccountMenu() {
  const { emailAccount } = useAccount();
  const { data: accountsData } = useAccounts();

  if (!emailAccount) return null;

  const otherAccounts =
    accountsData?.emailAccounts.filter(
      (account) => account.id !== emailAccount.id,
    ) ?? [];

  const switchAccount = async (emailAccountId: string) => {
    try {
      await setLastEmailAccountAction({ emailAccountId });
    } catch {
      // Ignore cookie update failures and continue navigation.
    }
    redirectToSafeUrl(`/${emailAccountId}/onboarding`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${emailAccount.email}`}
          className="flex items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          <AccountInitial label={emailAccount.name || emailAccount.email} />
          <span className="hidden max-w-52 truncate sm:block">
            {emailAccount.email}
          </span>
          <ChevronDownIcon className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium text-foreground">
            {emailAccount.email}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {otherAccounts.map((account) => (
          <DropdownMenuItem
            key={account.id}
            className="gap-2"
            onSelect={() => switchAccount(account.id)}
          >
            <AccountInitial label={account.name || account.email} />
            <span className="truncate">{account.email}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild className="gap-2">
          <Link href="/accounts">
            <PlusIcon className="size-4" />
            Switch or add account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => logOut(window.location.origin)}
        >
          <LogOutIcon className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountInitial({ label }: { label: string }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-300">
      {label.at(0)?.toUpperCase()}
    </span>
  );
}
