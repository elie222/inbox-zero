"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import PQueue from "p-queue";
import { archiveThreadAction, trashThreadAction } from "@/utils/actions";

const QueueContext = createContext<{
  archiveEmails: (emailIds: string[]) => Promise<void>;
  readEmails: (emailIds: string[]) => Promise<void>;
  labelEmails: (emailIds: string[], label: string) => Promise<void>;
  deleteEmails: (emailIds: string[]) => Promise<void>;
}>({
  archiveEmails: async () => {},
  readEmails: async () => {},
  labelEmails: async () => {},
  deleteEmails: async () => {},
});
export const useQueue = () => useContext(QueueContext);

const queue = new PQueue({ concurrency: 3 });

export function QueueProvider({ children }: { children: React.ReactNode }) {
  const archiveEmails = useCallback(async (threadIds: string[]) => {
    threadIds.forEach((threadId) => {
      queue.add(async () => await archiveThreadAction(threadId));
    });
  }, []);
  const readEmails = async (emailIds: string[]) => {};
  const labelEmails = async (emailIds: string[], label: string) => {};

  const deleteEmails = useCallback(async (emailIds: string[]) => {
    emailIds.forEach((emailId) => {
      queue.add(async () => await trashThreadAction(emailId));
    });
  }, []);

  return (
    <QueueContext.Provider
      value={{ archiveEmails, readEmails, labelEmails, deleteEmails }}
    >
      {children}
    </QueueContext.Provider>
  );
}
