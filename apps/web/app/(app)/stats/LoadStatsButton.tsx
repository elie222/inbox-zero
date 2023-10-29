"use client";

import React from "react";
import useSWRMutation from "swr/mutation";
import { AreaChartIcon, Loader2 } from "lucide-react";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadTinybirdEmailsResponse } from "@/app/api/user/stats/tinybird/load/route";
import { Button } from "@/components/ui/button";

export function useLoading() {
  const [loading, setLoading] = React.useState(false);

  const { trigger, isMutating } = useSWRMutation("/api/user", async () => {
    if (loading) return;

    setLoading(true);

    const res = await postRequest<LoadTinybirdEmailsResponse, {}>(
      "/api/user/stats/tinybird/load",
      {}
    );

    if (isError(res)) {
      toastError({ description: `Error loading stats.` });
    } else {
      toastSuccess({ description: `Stats loaded!` });
    }
    setLoading(false);
  });

  return { loading: isMutating, onLoad: trigger };
}

export function LoadStatsButton(props: {
  loading: boolean;
  onLoad: () => void;
}) {
  const { loading, onLoad } = props;

  return (
    <div>
      <Button
        color="blue"
        variant="outline"
        onClick={onLoad}
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
