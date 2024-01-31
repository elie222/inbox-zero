"use client";

import PQueue from "p-queue";
import { KeyedMutator } from "swr";
import { archiveThreadAction, trashThreadAction } from "@/utils/actions";
import { ThreadsResponse } from "@/app/api/google/threads/route";

const queue = new PQueue({ concurrency: 3 });

export const archiveEmails = async (
  threadIds: string[],
  refetch: KeyedMutator<ThreadsResponse>,
) => {
  queue.addAll(
    threadIds.map((threadId) => async () => {
      archiveThreadAction(threadId);

      refetch(undefined, {
        rollbackOnError: true,
        optimisticData: (currentData) => {
          const threads =
            currentData?.threads.filter((t) => !threadIds.includes(t.id)) || [];
          return { threads };
        },
        populateCache: (_, currentData) => {
          const threads =
            currentData?.threads.filter((t) => !threadIds.includes(t.id)) || [];
          return { threads };
        },
      });
    }),
  );
};
export const deleteEmails = async (
  threadIds: string[],
  refetch: KeyedMutator<ThreadsResponse>,
) => {
  queue.addAll(
    threadIds.map((threadId) => async () => {
      await trashThreadAction(threadId);

      refetch(undefined, {
        rollbackOnError: true,
        optimisticData: (currentData) => {
          const threads =
            currentData?.threads.filter((t) => !threadIds.includes(t.id)) || [];
          return { threads };
        },
        populateCache: (_, currentData) => {
          const threads =
            currentData?.threads.filter((t) => !threadIds.includes(t.id)) || [];
          return { threads };
        },
      });
    }),
  );
};

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
