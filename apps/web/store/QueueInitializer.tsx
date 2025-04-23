"use client";

import { useEffect } from "react";
import { processQueue, useQueueState } from "@/store/archive-queue";
import { useAccount } from "@/providers/AccountProvider";

let isInitialized = false;

function useInitializeQueues() {
  const queueState = useQueueState();
  const { email } = useAccount();

  useEffect(() => {
    if (!isInitialized) {
      isInitialized = true;
      if (queueState.activeThreads) {
        processQueue({
          threads: queueState.activeThreads,
          email,
        });
      }
    }
  }, [queueState.activeThreads, email]);
}

export function QueueInitializer() {
  useInitializeQueues();
  return null;
}
