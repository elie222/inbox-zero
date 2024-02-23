"use client";

import { useEffect } from "react";
import PQueue from "p-queue";
import {
  archiveThreadAction,
  markReadThreadAction,
  trashThreadAction,
} from "@/utils/actions";

const queue = new PQueue({ concurrency: 3 });

function updateArchiveQueueStorage(
  threadIds: string[],
  state: "pending" | "complete",
) {
  const currentStateString = localStorage.getItem("archiveQueue");

  if (currentStateString) {
    const currentState: string[] = JSON.parse(currentStateString);
    const updatedState: string[] =
      state === "pending"
        ? Array.from(new Set([...currentState, ...threadIds]))
        : currentState.filter((id: string) => !threadIds.includes(id));
    localStorage.setItem("archiveQueue", JSON.stringify(updatedState));
  } else {
    return localStorage.setItem("archiveQueue", JSON.stringify(threadIds));
  }
}

export const archiveEmails = async (
  threadIds: string[],
  refetch: () => void,
) => {
  updateArchiveQueueStorage(threadIds, "pending");

  queue.addAll(
    threadIds.map((threadId) => async () => {
      await archiveThreadAction(threadId);
      updateArchiveQueueStorage([threadId], "complete");
      refetch();
    }),
  );
};

function resumePendingArchiveEmails() {
  const currentStateString = localStorage.getItem("archiveQueue");
  if (!currentStateString) return;

  const currentState = JSON.parse(currentStateString);
  if (!currentState.length) return;
  archiveEmails(currentState, () => {});
}

export const deleteEmails = async (
  threadIds: string[],
  refetch: () => void,
) => {
  queue.addAll(
    threadIds.map((threadId) => async () => {
      trashThreadAction(threadId);
      refetch();
    }),
  );
};

export const markReadThreads = async (
  threadIds: string[],
  read: boolean,
  refetch: () => void,
) => {
  queue.addAll(
    threadIds.map((threadId) => async () => {
      await markReadThreadAction(threadId, read);
      refetch();
    }),
  );
};

export function QueueProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    resumePendingArchiveEmails();
  }, []);

  return <>{children}</>;
}

// may switch to this in the future:
// const QueueContext = createContext<{
//   archiveEmails: (emailIds: string[]) => Promise<void>;
//   readEmails: (emailIds: string[]) => Promise<void>;
//   labelEmails: (emailIds: string[], label: string) => Promise<void>;
//   deleteEmails: (emailIds: string[]) => Promise<void>;
// }>({
//   archiveEmails: async () => {},
//   readEmails: async () => {},
//   labelEmails: async () => {},
//   deleteEmails: async () => {},
// });
// export const useQueue = () => useContext(QueueContext);

// export function QueueProvider({ children }: { children: React.ReactNode }) {
//   const archiveEmails = useCallback(async (threadIds: string[]) => {
//     threadIds.forEach((threadId) => {
//       queue.add(async () => await archiveThreadAction(threadId));
//     });
//   }, []);
//   const readEmails = async (emailIds: string[]) => {};
//   const labelEmails = async (emailIds: string[], label: string) => {};

//   const deleteEmails = useCallback(async (emailIds: string[]) => {
//     emailIds.forEach((emailId) => {
//       queue.add(async () => await trashThreadAction(emailId));
//     });
//   }, []);

//   return (
//     <QueueContext.Provider
//       value={{ archiveEmails, readEmails, labelEmails, deleteEmails }}
//     >
//       {children}
//     </QueueContext.Provider>
//   );
// }
