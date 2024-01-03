"use client";

import { NewSenders } from "@/app/(app)/new-senders/NewSenders";
import { LoadStatsButton } from "@/app/(app)/stats/LoadStatsButton";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { useEffect } from "react";

export default function NewSendersPage() {
  const { isLoading, onLoad } = useStatLoader();
  const refreshInterval = isLoading ? 5_000 : 1_000_000;
  useEffect(() => {
    onLoad({ loadBefore: false, showToast: false });
  }, [onLoad]);

  return (
    <div>
      <div className="sticky top-0 z-10 flex border-b bg-white px-4 py-2 shadow sm:justify-between">
        <div />
        <div className="space-y-1 sm:flex sm:space-x-1 sm:space-y-0">
          <LoadStatsButton />
        </div>
      </div>

      <div className="m-4">
        <NewSenders refreshInterval={refreshInterval} />
      </div>
    </div>
  );
}
