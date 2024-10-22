"use client";

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { processQueue, queueAtom } from "@/store/archive-queue";

let isInitialized = false;

function useInitializeQueues() {
  const queueState = useAtomValue(queueAtom);

  useEffect(() => {
    if (!isInitialized) {
      isInitialized = true;
      if (queueState.activeThreads) {
        processQueue({ threads: queueState.activeThreads });
      }
    }
  }, [queueState.activeThreads]);
}

export function QueueInitializer() {
  useInitializeQueues();
  return null;
}
