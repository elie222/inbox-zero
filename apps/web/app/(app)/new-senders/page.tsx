"use client";

import { NewSenders } from "@/app/(app)/new-senders/NewSenders";
import { LoadStatsButton, useLoading } from "@/app/(app)/stats/LoadStatsButton";

export default function NewSendersPage() {
  const { loading, onLoad } = useLoading();

  return (
    <div>
      <div className="sticky top-0 z-10 flex border-b bg-white px-4 py-2 shadow sm:justify-between">
        <div />
        <div className="space-y-1 sm:flex sm:space-x-1 sm:space-y-0">
          <LoadStatsButton loading={loading} onLoad={onLoad} />
        </div>
      </div>

      <div className="m-4">
        <NewSenders />
      </div>
    </div>
  );
}
