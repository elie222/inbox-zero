import prisma from "@/utils/prisma";

export async function getBulkRunStatus(userId: string) {
  const runs = await prisma.bulkRuleRun.findMany({
    where: { emailAccount: { userId } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      emailAccountId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      startDate: true,
      endDate: true,
      includeRead: true,
      rerun: true,
      generateDraftReplies: true,
      scannedAt: true,
      error: true,
      leaseUntil: true,
      emailAccount: { select: { email: true } },
      items: {
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: {
          id: true,
          subject: true,
          status: true,
          ruleNames: true,
          error: true,
        },
      },
    },
  });
  const counts = await prisma.bulkRuleRunItem.groupBy({
    by: ["runId", "status"],
    where: { runId: { in: runs.map((run) => run.id) } },
    _count: true,
  });
  return {
    runs: runs.map((run) => {
      const items = counts.filter((count) => count.runId === run.id);
      return {
        ...run,
        total: items.reduce((sum, item) => sum + item._count, 0),
        completed: items
          .filter((item) => ["COMPLETED", "SKIPPED"].includes(item.status))
          .reduce((sum, item) => sum + item._count, 0),
        failed: items
          .filter((item) => item.status === "FAILED")
          .reduce((sum, item) => sum + item._count, 0),
      };
    }),
  };
}
