"use client";

import { useEffect } from "react";
import { processQueue, useQueueState } from "@/store/archive-queue";
import { useAccount } from "@/providers/EmailAccountProvider";

let isInitialized = false;

function useInitializeQueues() {
  const queueState = useQueueState();
  const { emailAccountId } = useAccount();

  useEffect(() => {
    if (!isInitialized) {
      isInitialized = true;
      if (queueState.activeThreads) {
        processQueue({
          threads: queueState.activeThreads,
          emailAccountId,
        });
      }
    }
  }, [queueState.activeThreads, emailAccountId]);
}

export function QueueInitializer() {
  useInitializeQueues();
  return null;
}
