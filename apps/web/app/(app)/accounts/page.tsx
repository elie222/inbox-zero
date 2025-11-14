"use client";

import { useAction } from "next-safe-action/hooks";
import Link from "next/link";
import { Trash2, ArrowRight, BotIcon } from "lucide-react";
import { useEffect, useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AccountsPage() {
  const { data, isLoading, error, mutate } = useAccounts();
  useAccountNotifications();

  return (
    <PageWrapper>
      <PageHeader title="Accounts" description="Manage your email accounts." />

      <LoadingContent loading={isLoading} error={error}>
        <div className="grid grid-cols-1 gap-4 py-6 md:grid-cols-2 lg:grid-cols-3">
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

      <MergeConfirmationDialog />
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
    <Card>
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
      <CardContent className="flex justify-end gap-2 flex-wrap">
        <Button variant="outline" size="sm" Icon={BotIcon}>
          <Link href={prefixPath(emailAccount.id, "/automation")}>
            Assistant
          </Link>
        </Button>
        <Button variant="outline" size="sm" Icon={ArrowRight}>
          <Link href={prefixPath(emailAccount.id, "/setup")}>Setup</Link>
        </Button>
        <ConfirmDialog
          trigger={
            <Button
              variant="destructiveSoft"
              size="sm"
              loading={isExecuting}
              Icon={Trash2}
            >
              Delete
            </Button>
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
      </CardContent>
    </Card>
  );
}

function MergeConfirmationDialog() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [showDialog, setShowDialog] = useState(false);
  const [provider, setProvider] = useState<"google" | "microsoft">();
  const [email, setEmail] = useState<string>();
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    const confirmMerge = searchParams.get("confirm_merge");
    const providerParam = searchParams.get("provider");
    const emailParam = searchParams.get("email");

    if (confirmMerge === "true" && providerParam && emailParam) {
      setShowDialog(true);
      setProvider(providerParam as "google" | "microsoft");
      setEmail(emailParam);
      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);

  const handleConfirm = async () => {
    if (!provider) return;

    setIsConfirming(true);
    try {
      const apiProvider = provider === "google" ? "google" : "outlook";
      const response = await fetch(
        `/api/${apiProvider}/linking/auth-url?action=merge_confirmed`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        toastError({
          title: "Error initiating merge",
          description: "Please try again or contact support",
        });
        setIsConfirming(false);
        return;
      }

      const data = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error("Error initiating merge:", error);
      toastError({
        title: "Error initiating merge",
        description: "Please try again or contact support",
      });
      setIsConfirming(false);
    }
  };

  const handleCancel = () => {
    setShowDialog(false);
    setProvider(undefined);
    setEmail(undefined);
  };

  return (
    <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Merge Accounts?</AlertDialogTitle>
          <AlertDialogDescription>
            The {provider === "google" ? "Google" : "Microsoft"} account{" "}
            <strong>{email}</strong> already has an Inbox Zero account.
            <br />
            <br />
            Merging will combine both accounts into one. This will delete the
            old account and move all its data to your current account. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isConfirming}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isConfirming}>
            {isConfirming ? "Merging..." : "Merge Accounts"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
