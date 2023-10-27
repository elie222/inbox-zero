"use client";

import React, { useCallback } from "react";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
import { AreaChartIcon, Loader2 } from "lucide-react";
import { LoadTinybirdEmailsResponse } from "@/app/api/user/stats/tinybird/load/route";
import { Button } from "@/components/ui/button";

export function LoadStatsButton() {
  const [loading, setLoading] = React.useState(false);

  const onClick = useCallback(async () => {
    setLoading(true);

    toastInfo({
      description: `Loading stats... This can take a few hours the first time you run it.`,
    });

    const res = await postRequest<LoadTinybirdEmailsResponse, {}>(
      "/api/user/stats/tinybird/load",
      {}
    );

    if (isError(res)) {
      toastError({ description: `Error loading stats.` });
    } else {
      toastSuccess({
        description: `Stats loaded!`,
      });
    }
    setLoading(false);
  }, []);

  return (
    <div>
      <Button
        color="blue"
        variant="outline"
        onClick={onClick}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <AreaChartIcon className="mr-2 h-4 w-4" />
        )}
        Load Stats
      </Button>
    </div>
  );
}
