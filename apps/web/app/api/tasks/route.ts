import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { isTaskOpen } from "@/utils/tasks";
import prisma from "@/utils/prisma";

export type TasksResponse = Awaited<ReturnType<typeof getTasks>>;

// Lists the account's tasks with their activity timelines. Open tasks first
// (soonest due, then highest priority), closed tasks after.
export const GET = withEmailAccount("tasks", async (request) => {
  const { emailAccountId } = request.auth;
  const result = await getTasks({ emailAccountId });
  return NextResponse.json(result);
});

async function getTasks({ emailAccountId }: { emailAccountId: string }) {
  const tasks = await prisma.task.findMany({
    where: { emailAccountId },
    include: {
      activity: { orderBy: { createdAt: "desc" }, take: 50 },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  // Open tasks first (by due date then priority), closed tasks last
  const priorityRank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
  const sorted = [...tasks].sort((a, b) => {
    const aOpen = isTaskOpen(a.status);
    const bOpen = isTaskOpen(b.status);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen) {
      if (!!a.dueAt !== !!b.dueAt) return a.dueAt ? -1 : 1;
      if (a.dueAt && b.dueAt) {
        const diff = a.dueAt.getTime() - b.dueAt.getTime();
        if (diff !== 0) return diff;
      }
      const rankDiff = priorityRank[a.priority] - priorityRank[b.priority];
      if (rankDiff !== 0) return rankDiff;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return { tasks: sorted };
}
