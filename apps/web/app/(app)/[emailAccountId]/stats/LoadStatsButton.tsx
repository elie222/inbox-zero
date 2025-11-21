"use client";

import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { useStatLoader } from "@/providers/StatLoaderProvider";

export function LoadStatsButton() {
  const { isLoading, onLoadBatch } = useStatLoader();

  return (
    <div>
      <Button
        variant="outline"
        onClick={() => onLoadBatch({ loadBefore: true, showToast: true })}
        disabled={isLoading}
      >
        {isLoading ? (
          <ButtonLoader />
        ) : (
          <RefreshCcw className="mr-2 hidden h-4 w-4 sm:block" />
        )}
        {isLoading ? "Loading more..." : "Load more"}
      </Button>
    </div>
  );
}
