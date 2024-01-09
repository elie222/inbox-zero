import { gmail_v1 } from "googleapis";
import { LABEL_STORE, getIdb } from "@/utils/indexeddb";

export async function getLabels() {
  return (await getIdb()).getAll(LABEL_STORE);
}

export async function saveLabels(labels: gmail_v1.Schema$Label[]) {
  if (!labels.length) return;

  const tx = (await getIdb()).transaction(LABEL_STORE, "readwrite");

  await Promise.all([
    ...labels.map((label) => {
      return tx.store.add(label);
    }),
    tx.done,
  ]);
}
