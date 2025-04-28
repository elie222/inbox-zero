"use client";

import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeading } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardHeader, CardContent } from "@/components/ui/card";
import { useAccounts } from "@/hooks/useAccounts";
import { useAction } from "next-safe-action/hooks";
import { deleteEmailAccountAction } from "@/utils/actions/user";
import { toastError } from "@/components/Toast";
import { toastSuccess } from "@/components/Toast";

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
          {data?.emailAccounts.map((account) => (
            <Card key={account.id}>
              <CardHeader>
                <CardTitle>{account.email}</CardTitle>
              </CardHeader>
              <CardContent>
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
                  description={`Are you sure you want to delete "${account.email}"? This will delete all data for it on Inbox Zero.`}
                  confirmText="Delete"
                  onConfirm={() => {
                    execute({ emailAccountId: account.id });
                  }}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </LoadingContent>
    </div>
  );
}
