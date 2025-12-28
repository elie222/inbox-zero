import prisma from "@/utils/prisma";
import { format } from "date-fns";
import type { ResponseTimeStats } from "../types";

export async function computeResponseTimeStats(
  emailAccountId: string,
  year: number,
): Promise<ResponseTimeStats> {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  // Get all response times for the year
  const responseTimes = await prisma.responseTime.findMany({
    where: {
      emailAccountId,
      sentAt: { gte: startDate, lt: endDate },
    },
    select: {
      responseTimeMins: true,
      sentAt: true,
    },
  });

  if (responseTimes.length === 0) {
    return {
      avgResponseTimeMins: null,
      fastestReplyMins: null,
      fastestReplyDate: null,
      totalRepliesTracked: 0,
    };
  }

  // Calculate average response time
  const totalMins = responseTimes.reduce(
    (sum, rt) => sum + rt.responseTimeMins,
    0,
  );
  const avgResponseTimeMins = Math.round(totalMins / responseTimes.length);

  // Find fastest reply
  const fastestReply = responseTimes.reduce((fastest, current) =>
    current.responseTimeMins < fastest.responseTimeMins ? current : fastest,
  );

  return {
    avgResponseTimeMins,
    fastestReplyMins: fastestReply.responseTimeMins,
    fastestReplyDate: format(fastestReply.sentAt, "yyyy-MM-dd"),
    totalRepliesTracked: responseTimes.length,
  };
}
