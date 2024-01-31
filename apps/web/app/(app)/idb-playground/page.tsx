"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { type gmail_v1 } from "googleapis";
import { getLabels, saveLabels } from "@/utils/indexeddb/labels";
import { TopSection } from "@/components/TopSection";
import { LabelsResponse } from "@/app/api/google/labels/route";
import { Button } from "@/components/Button";
import { WithServiceWorker } from "@/components/WithServiceWorker";

export default function IDBPlayground() {
  const [labels, setLabels] = useState<gmail_v1.Schema$Label[]>([]);
  const [mailLoad, setMailLoad] = useState(false);
  const [statLoad, setStatLoad] = useState(false);

  const onMessage = ({
    data,
    type,
  }: {
    data: LabelsResponse;
    type: string;
  }) => {
    if (type === "LABELS_UPDATED") setLabels(data.labels ?? []);
  };

  useEffect(() => {
    fetch("/api/user/stats/emails/all", {
      method: "POST",
      body: JSON.stringify({ loadBefore: false }),
    })
      .then((resp) => resp.json())
      .then(console.log);
  }, [mailLoad]);
  useEffect(() => {
    fetch(
      "/api/user/stats/emails/sw?period=week&fromDate=1703745824000&toDate=1706423263000",
      {
        method: "GET",
      },
    )
      .then((resp) => resp.json())
      .then(console.log);
  }, [statLoad]);

  const { data, isLoading, error } =
    useSWR<LabelsResponse>("/api/google/labels");

  useEffect(() => {
    if (data?.labels) {
      setLabels(data.labels);
    }
  }, [data]);

  return (
    <WithServiceWorker callback={onMessage}>
      <div>
        <TopSection title="IndexedDB Playground" />

        <div className="p-4">
          {!labels.length && <div>No labels found.</div>}

          <div className="grid gap-2">
            {labels.map((l) => {
              return <div key={l.id}>{l.name}</div>;
            })}
          </div>

          <Button onClick={() => setMailLoad((prev) => !prev)}>
            Load All Data
          </Button>
          <Button onClick={() => setStatLoad((prev) => !prev)}>
            Load All Stats
          </Button>
        </div>
      </div>
    </WithServiceWorker>
  );
}
