"use client";

import { useCallback, useState } from "react";
import { AreaChartIcon, Loader2 } from "lucide-react";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  type LoadTinybirdEmailsBody,
  type LoadTinybirdEmailsResponse,
} from "@/app/api/user/stats/tinybird/load/route";
import { Button, ButtonLoader } from "@/components/ui/button";

export function useLoading() {
  const [loading, setLoading] = useState(false);

  const onLoad = useCallback(
    async (loadBefore: boolean, showSuccess: boolean) => {
      if (loading) return;

      setLoading(true);

      const res = await postRequest<
        LoadTinybirdEmailsResponse,
        LoadTinybirdEmailsBody
      >("/api/user/stats/tinybird/load", {
        loadBefore,
      });

      if (isError(res)) {
        toastError({ description: `Error loading stats.` });
      } else {
        if (showSuccess) toastSuccess({ description: `Stats loaded!` });
      }
      setLoading(false);
    },
    [loading]
  );

  return { loading, onLoad };
}

export function LoadStatsButton(props: {
  loading: boolean;
  onLoad: (loadBefore: boolean, showSuccess: boolean) => void;
}) {
  const { loading, onLoad } = props;

  return (
    <div>
      <Button
        color="blue"
        variant="outline"
        onClick={() => onLoad(true, true)}
        disabled={loading}
      >
        {loading ? (
          <ButtonLoader />
        ) : (
          <AreaChartIcon className="mr-2 h-4 w-4" />
        )}
        Load Stats
      </Button>
    </div>
  );
}
