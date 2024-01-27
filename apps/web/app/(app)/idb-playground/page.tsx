"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { type gmail_v1 } from "googleapis";
import { getLabels, saveLabels } from "@/utils/indexeddb/labels";
import { TopSection } from "@/components/TopSection";
import { LabelsResponse } from "@/app/api/google/labels/route";
import { Button } from "@/components/Button";

export default function IDBPlayground() {
  const [labels, setLabels] = useState<gmail_v1.Schema$Label[]>([]);
  const [mailLoad, setMailLoad] = useState(false);

  // fetch data from idb

  // example of loading data into idb
  // if you comment out this section after data is first loaded the labels will still show up

  useEffect(() => {
    const onMessage = ({
      data,
      type,
    }: {
      data: LabelsResponse;
      type: string;
    }) => {
      if (type === "LABELS_UPDATED") setLabels(data.labels ?? []);
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) =>
        onMessage(event.data),
      );
    }
  }, []);

  useEffect(() => {
    fetch("/api/user/stats/emails/all", {
      method: "POST",
      body: JSON.stringify({ loadBefore: false }),
    })
      .then((resp) => resp.json())
      .then(console.log);
  }, [mailLoad]);

  const { data, isLoading, error } =
    useSWR<LabelsResponse>("/api/google/labels");

  useEffect(() => {
    if (data?.labels) {
      setLabels(data.labels);
    }
  }, [data]);

  return (
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
      </div>
    </div>
  );
}
