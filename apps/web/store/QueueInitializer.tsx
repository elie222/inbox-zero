"use client";

import { useEffect } from "react";
import { processQueue, useQueueState } from "@/store/archive-queue";

let isInitialized = false;

function useInitializeQueues() {
  const queueState = useQueueState();

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
