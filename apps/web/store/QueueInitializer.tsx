"use client";

import { useAtom } from "jotai";
import { useEffect } from "react";
import { processQueue, queueAtoms } from "@/store/archive-queue";

function useInitializeQueues() {
  const [archiveQueue] = useAtom(queueAtoms.archive);
  const [deleteQueue] = useAtom(queueAtoms.delete);
  const [markReadQueue] = useAtom(queueAtoms.markRead);

  useEffect(() => {
    const threadIds = Object.keys(archiveQueue.activeThreadIds || {});
    if (threadIds.length) processQueue("archive", threadIds);
  }, [archiveQueue]);

  useEffect(() => {
    const threadIds = Object.keys(deleteQueue.activeThreadIds || {});
    if (threadIds.length) processQueue("delete", threadIds);
  }, [deleteQueue]);

  useEffect(() => {
    const threadIds = Object.keys(markReadQueue.activeThreadIds || {});
    if (threadIds.length) processQueue("markRead", threadIds);
  }, [markReadQueue]);
}

export function QueueInitializer() {
  useInitializeQueues();
  return null;
}
