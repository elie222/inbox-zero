"use client";

import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeading } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardHeader, CardContent } from "@/components/ui/card";
import { useAccounts } from "@/hooks/useAccounts";

export default function AccountsPage() {
  const { data, isLoading, error } = useAccounts();

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
                    <Button variant="destructive" size="sm">
                      Delete
                      <Trash2 className="ml-2 h-4 w-4" />
                    </Button>
                  }
                  title="Delete Account"
                  description={`Are you sure you want to delete "${account.email}"? This will delete all data for it on Inbox Zero.`}
                  confirmText="Delete"
                  onConfirm={async () => {}}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </LoadingContent>
    </div>
  );
}
