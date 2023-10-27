"use client";

import React, { useCallback } from "react";
import { Button } from "@/components/Button";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
import { AreaChartIcon } from "lucide-react";
import { LoadTinybirdEmailsResponse } from "@/app/api/user/stats/tinybird/load/route";

export function LoadStatsButton() {
  const [clicked, setClicked] = React.useState(false);

  const onClick = useCallback(async () => {
    setClicked(true);

    toastInfo({
      description: `Loading stats... This can take a few hours the first time you run it.`,
    });

    const res = await postRequest<LoadTinybirdEmailsResponse, {}>(
      "/api/user/stats/tinybird/load",
      {}
    );

    if (isError(res)) {
      setClicked(false);
      toastError({ description: `Error loading stats.` });
    } else {
      toastSuccess({
        description: `Stats loaded!`,
      });
    }
  }, []);

  return (
    <div>
      <Button onClick={onClick} loading={clicked} disabled={clicked}>
        <AreaChartIcon className="mr-2 h-4 w-4" />
        Load Stats
      </Button>
    </div>
  );
}
