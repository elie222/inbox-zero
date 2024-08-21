"use client";

import { AreaChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { useStatLoader } from "@/providers/StatLoaderProvider";

export function LoadStatsButton() {
  const { isLoading, onLoad } = useStatLoader();

  return (
    <div>
      <Button
        variant="outline"
        onClick={() => onLoad({ loadBefore: true, showToast: true })}
        disabled={isLoading}
      >
        {isLoading ? (
          <ButtonLoader />
        ) : (
          <AreaChartIcon className="mr-2 h-4 w-4" />
        )}
        Load more
      </Button>
    </div>
  );
}
