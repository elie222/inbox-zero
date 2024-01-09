"use client";

import { openDB, IDBPDatabase } from "idb";
import { InboxZeroDB } from "@/utils/indexeddb/types";

export const LABEL_STORE = "labels";
export const EMAIL_STORE = "emails";

let db: IDBPDatabase<InboxZeroDB>;

export async function getIdb(): Promise<IDBPDatabase<InboxZeroDB>> {
  if (!db) {
    db = await openDB<InboxZeroDB>("inbox-zero", 1, {
      upgrade(db) {
        const labelStore = db.createObjectStore(LABEL_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        // TODO labelStore.createIndex('', '')

        const emailStore = db.createObjectStore(EMAIL_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        // TODO emailStore.createIndex('', '')
      },
    });
  }

  return db;
}
