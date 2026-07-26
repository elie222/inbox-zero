"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { ExecutedRuleStatus, GroupItemType } from "@/generated/prisma/enums";
import { analyzeSenderPattern } from "@/utils/ai/choose-rule/analyze-sender-pattern";
import { runWithBoundedConcurrency } from "@/utils/async";
import prisma from "@/utils/prisma";
import { learnPatternsFromHistoryBody } from "@/utils/actions/learn-patterns.validation";

const MAX_CANDIDATES = 15;
const MIN_THREADS = 3;

// Learns patterns for a rule from mail that's ALREADY been processed:
// senders this rule has applied to at least 3 times get queued through the
// same analysis pipeline that runs on new mail — but forced, so senders
// dismissed earlier (before enough history existed) get another look.
// Normally patterns only accrue as new AI-matched mail arrives; this mines
// the backlog on demand.
export const learnPatternsFromHistoryAction = actionClient
  .metadata({ name: "learnPatternsFromHistory" })
  .inputSchema(learnPatternsFromHistoryBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { ruleId } }) => {
      const rule = await prisma.rule.findFirst({
        where: { id: ruleId, emailAccountId },
        select: { id: true, groupId: true },
      });
      if (!rule) throw new SafeError("Rule not found");

      // Senders whose mail this rule has consistently been applied to,
      // busiest first (ExecutedRule holds no sender — join the mail cache)
      const senders = await prisma.$queryRaw<
        { sender: string; threads: bigint }[]
      >`
      SELECT LOWER(em."from") AS sender, COUNT(DISTINCT er."threadId") AS threads
      FROM "ExecutedRule" er
      JOIN "EmailMessage" em
        ON em."emailAccountId" = er."emailAccountId"
       AND em."messageId" = er."messageId"
      WHERE er."emailAccountId" = ${emailAccountId}
        AND er."ruleId" = ${ruleId}
        AND er."status" = ${ExecutedRuleStatus.APPLIED}::"ExecutedRuleStatus"
        AND em."from" <> ''
      GROUP BY 1
      HAVING COUNT(DISTINCT er."threadId") >= ${MIN_THREADS}
      ORDER BY 2 DESC
      LIMIT ${MAX_CANDIDATES}
    `;

      // Skip senders the rule already learned
      const learned = rule.groupId
        ? await prisma.groupItem.findMany({
            where: { groupId: rule.groupId, type: GroupItemType.FROM },
            select: { value: true },
          })
        : [];
      const learnedSet = new Set(
        learned.map((item) => item.value.toLowerCase()),
      );
      const candidates = senders
        .map((row) => row.sender)
        .filter((sender) => !learnedSet.has(sender));

      if (!candidates.length) {
        return { candidates: 0, queued: 0, failed: 0 };
      }

      // Each call runs the full pipeline (consistency check + AI) in the
      // background on the server; here we only queue and count acceptance
      const results = await runWithBoundedConcurrency({
        items: candidates,
        concurrency: 3,
        run: (sender) =>
          analyzeSenderPattern(
            { emailAccountId, from: sender, force: true },
            logger,
          ),
      });

      let queued = 0;
      let failed = 0;
      for (const entry of results) {
        if (entry.result.status === "fulfilled" && entry.result.value.ok) {
          queued++;
        } else {
          failed++;
        }
      }

      if (failed && !queued) {
        throw new SafeError(
          "The analysis endpoint rejected every request — check that INTERNAL_API_KEY is set correctly in your deployment.",
        );
      }

      return { candidates: candidates.length, queued, failed };
    },
  );
