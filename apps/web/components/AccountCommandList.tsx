"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, CheckIcon, PlusIcon } from "lucide-react";
import { getMailAccountUrl } from "@/app/(app)/[emailAccountId]/mail/mail-account-url";
import { LoadingContent } from "@/components/LoadingContent";
import { ProfileImage } from "@/components/ProfileImage";
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { redirectToSafeUrl } from "@/utils/redirect";

export function AccountCommandList({
  search,
  onClose,
  onBack,
}: {
  search: string;
  onClose: () => void;
  onBack: () => void;
}) {
  const { data, isLoading, error } = useAccounts();
  const { emailAccountId } = useAccount();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isMail = pathname.endsWith("/mail");
  const query = search.trim().toLowerCase();
  const accounts = data?.emailAccounts.filter((account) =>
    `${account.email} ${account.name ?? ""}`.toLowerCase().includes(query),
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <>
          <CommandEmpty>No accounts found.</CommandEmpty>
          <CommandGroup heading="Accounts">
            {accounts?.map((account) => (
              <CommandItem
                key={account.id}
                aria-label={account.email}
                value={`account-${account.id}`}
                onSelect={() => {
                  onClose();
                  if (isMail) {
                    redirectToSafeUrl(
                      getMailAccountUrl(account.id, window.location.search),
                    );
                  } else {
                    router.push(prefixPath(account.id, "/automation"));
                  }
                }}
              >
                <ProfileImage
                  image={account.image}
                  label={account.name || account.email}
                  className="mr-3 size-7 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">{account.email}</span>
                {account.id === emailAccountId &&
                  (!isMail || searchParams.get("accountScope") !== "all") && (
                    <CheckIcon
                      className="ml-2 size-4 shrink-0"
                      aria-label="Current account"
                    />
                  )}
              </CommandItem>
            ))}
          </CommandGroup>
          {!query && (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="add-manage-accounts"
                  onSelect={() => {
                    onClose();
                    router.push("/accounts");
                  }}
                >
                  <PlusIcon className="mr-2 size-4" />
                  Add or manage accounts
                </CommandItem>
                <CommandItem value="accounts-back" onSelect={onBack}>
                  <ArrowLeftIcon className="mr-2 size-4" />
                  Back to commands
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </>
      )}
    </LoadingContent>
  );
}
