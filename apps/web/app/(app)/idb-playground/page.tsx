"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { type gmail_v1 } from "googleapis";
import { getLabels, saveLabels } from "@/utils/indexeddb/labels";
import { TopSection } from "@/components/TopSection";
import { LabelsResponse } from "@/app/api/google/labels/route";

export default function IDBPlayground() {
  const [labels, setLabels] = useState<gmail_v1.Schema$Label[]>([]);

  // fetch data from idb
  useEffect(() => {
    getLabels().then((labels) => setLabels(labels));
  }, []);

  // example of loading data into idb
  // if you comment out this section after data is first loaded the labels will still show up
  const { data, isLoading, error } =
    useSWR<LabelsResponse>("/api/google/labels");

  useEffect(() => {
    if (data?.labels) {
      saveLabels(data.labels);
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
      </div>
    </div>
  );
}
