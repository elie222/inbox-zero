"use client";

import { useCallback, useRef, useEffect } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { CategorizeSendersProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";
import { BulkOperationProgress } from "@/app/(app)/[emailAccountId]/deep-clean/BulkOperationProgress";
import { useAccount } from "@/providers/EmailAccountProvider";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { categorizeMoreSendersAction } from "@/utils/actions/deep-clean";
import { toast } from "sonner";
import { LoadingContent } from "@/components/LoadingContent";
import { DeepCleanGroupedTable } from "@/components/DeepCleanGroupedTable";
import { useDeepCleanSenders } from "@/hooks/useDeepClean";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";

export function DeepCleanContent() {
  const { emailAccount } = useAccount();
  const { data, isLoading, error, mutate } = useDeepCleanSenders();
  const hasAutoTriggered = useRef(false);

  const handleCategorizeMore = useCallback(async () => {
    if (!emailAccount?.id) return;

    try {
      const result = await categorizeMoreSendersAction(emailAccount.id, {
        limit: 100,
      });

      if (result?.data?.success) {
        toast.success(result.data.message);
        // Refresh data after categorization completes
        setTimeout(() => {
          mutate();
        }, 2000);
      } else {
        toast.error(result?.serverError || "Failed to categorize senders");
      }
    } catch (error) {
      toast.error("Failed to categorize senders");
      console.error("Categorize more error:", error);
    }
  }, [emailAccount?.id, mutate]);

  // Auto-trigger categorization on first load if we have very few senders
  useEffect(() => {
    if (hasAutoTriggered.current || !data || isLoading) return;

    // If first-time user with few/no senders, automatically fetch and categorize
    if (data.senders.length < 5) {
      hasAutoTriggered.current = true;
      handleCategorizeMore();
    }
  }, [data, isLoading, handleCategorizeMore]);

  if (!data || data.senders.length === 0) {
    return (
      <LoadingContent loading={isLoading} error={error}>
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              No categorized senders found. Start categorizing your inbox to use
              DeepClean.
            </p>
            <Button onClick={handleCategorizeMore}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Categorize Senders
            </Button>
          </div>
        </div>
      </LoadingContent>
    );
  }

  return (
    <LoadingContent loading={isLoading} error={error}>
      <PageWrapper>
        <div className="flex items-center justify-between">
          <PageHeader
            title="Deep Clean"
            description="Clean out your inbox in minutes."
          />

          <Button onClick={handleCategorizeMore} variant="outline" size="sm">
            Categorize more senders
          </Button>
        </div>

        <ClientOnly>
          <BulkOperationProgress />
          <CategorizeSendersProgress refresh={false} />
        </ClientOnly>
      </PageWrapper>

      <DeepCleanGroupedTable
        emailGroups={data.senders.map((sender) => ({
          address: sender.email,
          category: sender.category,
          meta: { width: "auto" },
        }))}
        categories={data.categories}
      />
    </LoadingContent>
  );
}
