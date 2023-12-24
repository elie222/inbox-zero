"use client";

import { AreaChartIcon } from "lucide-react";
import { Button, ButtonLoader } from "@/components/ui/button";
import { useStatLoader } from "@/providers/StatLoaderProvider";

export function LoadStatsButton() {
  const { isLoading, onLoad } = useStatLoader();

  return (
    <div>
      <Button
        color="blue"
        variant="outline"
        onClick={() => onLoad({ loadBefore: true, showToast: true })}
        disabled={isLoading}
      >
        {isLoading ? (
          <ButtonLoader />
        ) : (
          <AreaChartIcon className="mr-2 h-4 w-4" />
        )}
        Load Stats
      </Button>
    </div>
  );
}
