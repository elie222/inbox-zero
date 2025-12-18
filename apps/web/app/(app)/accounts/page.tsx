"use client";

import { useAction } from "next-safe-action/hooks";
import Link from "next/link";
import { Trash2, MoreVertical, Settings } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardTitle,
  CardHeader,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccounts } from "@/hooks/useAccounts";
import { deleteEmailAccountAction } from "@/utils/actions/user";
import { toastSuccess, toastError } from "@/components/Toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { prefixPath } from "@/utils/path";
import { AddAccount } from "@/app/(app)/accounts/AddAccount";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { logOut } from "@/utils/user";
import { getAndClearAuthErrorCookie } from "@/utils/auth-cookies";

export default function AccountsPage() {
  const { data, isLoading, error, mutate } = useAccounts();
  useAccountNotifications();

  return (
    <PageWrapper>
      <PageHeader title="Accounts" />

      <LoadingContent loading={isLoading} error={error}>
        <div className="grid grid-cols-1 gap-4 py-6 lg:grid-cols-2 xl:grid-cols-3">
          {data?.emailAccounts.map((emailAccount) => (
            <AccountItem
              key={emailAccount.id}
              emailAccount={emailAccount}
              onAccountDeleted={mutate}
            />
          ))}
          <AddAccount />
        </div>
      </LoadingContent>
    </PageWrapper>
  );
}

function AccountItem({
  emailAccount,
  onAccountDeleted,
}: {
  emailAccount: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    isPrimary: boolean;
  };
  onAccountDeleted: () => void;
}) {
  return (
    <Card>
      <AccountHeader emailAccount={emailAccount} />
      <AccountActions
        emailAccount={emailAccount}
        onAccountDeleted={onAccountDeleted}
      />
    </Card>
  );
}

function AccountHeader({
  emailAccount,
}: {
  emailAccount: {
    name: string | null;
    email: string;
    image: string | null;
  };
}) {
  return (
    <CardHeader className="flex flex-row items-center gap-3 space-y-0">
      <Avatar>
        <AvatarImage src={emailAccount.image || undefined} />
        <AvatarFallback>
          {emailAccount.name?.[0] || emailAccount.email?.[0]}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col space-y-1.5">
        <CardTitle>{emailAccount.name}</CardTitle>
        <CardDescription>{emailAccount.email}</CardDescription>
      </div>
    </CardHeader>
  );
}

function AccountActions({
  emailAccount,
  onAccountDeleted,
}: {
  emailAccount: {
    id: string;
    email: string;
    isPrimary: boolean;
  };
  onAccountDeleted: () => void;
}) {
  return (
    <CardContent className="flex justify-between items-center gap-2 flex-wrap">
      <Button variant="outline" size="sm">
        <Link href={prefixPath(emailAccount.id, "/automation")}>View</Link>
      </Button>
      <AccountOptionsDropdown
        emailAccount={emailAccount}
        onAccountDeleted={onAccountDeleted}
      />
    </CardContent>
  );
}

function AccountOptionsDropdown({
  emailAccount,
  onAccountDeleted,
}: {
  emailAccount: {
    id: string;
    email: string;
    isPrimary: boolean;
  };
  onAccountDeleted: () => void;
}) {
  const { execute, isExecuting } = useAction(deleteEmailAccountAction, {
    onSuccess: async () => {
      toastSuccess({
        title: "Email account deleted",
        description: "The email account has been deleted successfully.",
      });
      onAccountDeleted();
      if (emailAccount.isPrimary) {
        await logOut("/login");
      }
    },
    onError: (error) => {
      toastError({
        title: "Error deleting email account",
        description: error.error.serverError || "An unknown error occurred",
      });
      onAccountDeleted();
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            href={prefixPath(emailAccount.id, "/setup")}
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            Setup
          </Link>
        </DropdownMenuItem>
        <ConfirmDialog
          trigger={
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="flex items-center gap-2 text-destructive focus:text-destructive"
              disabled={isExecuting}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          }
          title="Delete Account"
          description={
            emailAccount.isPrimary
              ? `Are you sure you want to delete "${emailAccount.email}"? This is your primary account. You will be logged out and need to log in again. Your oldest remaining account will become your new primary account. All data for "${emailAccount.email}" will be permanently deleted from Inbox Zero.`
              : `Are you sure you want to delete "${emailAccount.email}"? This will delete all data for it on Inbox Zero.`
          }
          confirmText="Delete"
          onConfirm={() => {
            execute({ emailAccountId: emailAccount.id });
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useAccountNotifications() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const authErrorCookie = getAndClearAuthErrorCookie();
    const errorParam = searchParams.get("error") || authErrorCookie;
    const successParam = searchParams.get("success");

    if (errorParam) {
      const errorMessages: Record<
        string,
        { title: string; description: string }
      > = {
        account_not_found_for_merge: {
          title: "Account not found",
          description:
            "This account doesn't exist in Inbox Zero yet. Please select 'No, it's a new account' instead.",
        },
        account_already_exists_use_merge: {
          title: "Account already exists",
          description:
            "This account already exists in Inbox Zero. Please select 'Yes, it's an existing Inbox Zero account' to merge.",
        },
        already_linked_to_self: {
          title: "Account already linked",
          description: "This account is already linked to your profile.",
        },
        invalid_state: {
          title: "Invalid request",
          description:
            "The authentication request was invalid. Please try again.",
        },
        missing_code: {
          title: "Authentication failed",
          description:
            "Failed to receive authentication code. Please try again.",
        },
        link_failed: {
          title: "Account linking failed",
          description:
            searchParams.get("error_description") ||
            "Failed to link account. Please try again.",
        },
      };

      const errorMessage = errorMessages[errorParam] || {
        title: "Error",
        description:
          searchParams.get("error_description") ||
          "An error occurred. Please try again.",
      };

      toastError({
        title: errorMessage.title,
        description: errorMessage.description,
      });

      router.replace(pathname);
    }

    if (successParam) {
      const successMessages: Record<
        string,
        { title: string; description: string }
      > = {
        account_merged: {
          title: "Account merged successfully!",
          description: "Your accounts have been merged.",
        },
        account_created_and_linked: {
          title: "Account added successfully!",
          description: "Your new account has been linked.",
        },
      };

      const successMessage = successMessages[successParam] || {
        title: "Success",
        description: "Operation completed successfully.",
      };

      toastSuccess({
        title: successMessage.title,
        description: successMessage.description,
      });

      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);
}
