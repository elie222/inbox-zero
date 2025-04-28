"use client";

import { useAction } from "next-safe-action/hooks";
import Link from "next/link";
import { Trash2, ArrowRight } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeading } from "@/components/Typography";
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

export default function AccountsPage() {
  const { data, isLoading, error, mutate } = useAccounts();
  const { execute, isExecuting } = useAction(deleteEmailAccountAction, {
    onSuccess: () => {
      toastSuccess({
        title: "Email account deleted",
        description: "The email account has been deleted successfully.",
      });
      mutate();
    },
    onError: (error) => {
      toastError({
        title: "Error deleting email account",
        description: error.error.serverError || "An unknown error occurred",
      });
      mutate();
    },
  });

  return (
    <div>
      <div className="border-b border-border px-8 py-6">
        <PageHeading>Accounts</PageHeading>
      </div>
      <LoadingContent loading={isLoading} error={error}>
        <div className="grid grid-cols-1 gap-4 px-8 py-6 md:grid-cols-2 lg:grid-cols-3">
          {data?.emailAccounts.map((emailAccount) => (
            <Card key={emailAccount.id}>
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
              <CardContent className="flex justify-end gap-2">
                <Link href={prefixPath(emailAccount.id, "/setup")}>
                  <Button variant="outline" size="sm" Icon={ArrowRight}>
                    View
                  </Button>
                </Link>
                {!emailAccount.isPrimary && (
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="destructive"
                        size="sm"
                        loading={isExecuting}
                        Icon={Trash2}
                      >
                        Delete
                      </Button>
                    }
                    title="Delete Account"
                    description={`Are you sure you want to delete "${emailAccount.email}"? This will delete all data for it on Inbox Zero.`}
                    confirmText="Delete"
                    onConfirm={() => {
                      execute({ emailAccountId: emailAccount.id });
                    }}
                  />
                )}
              </CardContent>
            </Card>
          ))}
          <AddAccount />
        </div>
      </LoadingContent>
    </div>
  );
}
