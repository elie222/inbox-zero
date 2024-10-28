"use client";

import { useState } from "react";
import useSWR from "swr";
import { SparklesIcon } from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { SendersTable } from "@/components/GroupedTable";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { UncategorizedSendersResponse } from "@/app/api/user/categorize/senders/uncategorized/route";
import { Category } from "@prisma/client";
import { TopBar } from "@/components/TopBar";
import { categorizeSenderAction } from "@/utils/actions/categorize";
import { toastError, toastSuccess } from "@/components/Toast";
import { isActionError } from "@/utils/error";

function useSenders() {
  return useSWR<UncategorizedSendersResponse>(
    "/api/user/categorize/senders/uncategorized",
  );
}

export function Uncategorized({ categories }: { categories: Category[] }) {
  const { data, isLoading, error } = useSenders();

  const [isCategorizing, setIsCategorizing] = useState(false);

  return (
    <LoadingContent loading={isLoading} error={error}>
      <TopBar>
        <Button
          onClick={async () => {
            if (!data?.uncategorizedSenders.length) {
              toastError({ description: "No senders to categorize" });
              return;
            }

            setIsCategorizing(true);

            for (const sender of data.uncategorizedSenders) {
              const result = await categorizeSenderAction(sender);

              if (isActionError(result)) {
                toastError({
                  title: `Error categorizing ${sender}`,
                  description: result.error,
                });
              } else {
                toastSuccess({
                  description: `Categorized ${sender}!`,
                });
              }
            }

            toastSuccess({ description: "Categorization complete!" });

            setIsCategorizing(false);
          }}
        >
          <SparklesIcon className="mr-2 size-4" />
          Categorize all with AI
        </Button>
      </TopBar>
      <ClientOnly>
        <SendersTable
          senders={
            data?.uncategorizedSenders.map((sender) => ({
              address: sender,
              category: null,
            })) || []
          }
          categories={categories}
        />
      </ClientOnly>
    </LoadingContent>
  );
}
