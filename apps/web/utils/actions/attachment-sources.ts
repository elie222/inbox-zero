"use server";

import { PremiumTier } from "@/generated/prisma/enums";
import { actionClient } from "@/utils/actions/safe-action";
import { upsertRuleAttachmentSourcesBody } from "@/utils/actions/attachment-sources.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { checkHasAccess } from "@/utils/premium/server";

export const upsertRuleAttachmentSourcesAction = actionClient
  .metadata({ name: "upsertRuleAttachmentSources" })
  .inputSchema(upsertRuleAttachmentSourcesBody)
  .action(
    async ({
      ctx: { emailAccountId, userId },
      parsedInput: { ruleId, sources },
    }) => {
      const rule = await prisma.rule.findUnique({
        where: { id: ruleId, emailAccountId },
        select: { id: true },
      });

      if (!rule) throw new SafeError("Rule not found");

      if (sources.length > 0) {
        const hasAccess = await checkHasAccess({
          userId,
          minimumTier: PremiumTier.PLUS_MONTHLY,
        });

        if (!hasAccess) {
          throw new SafeError(
            "Drive-powered draft attachments require the Plus plan or higher.",
          );
        }
      }

      const driveConnections = sources.length
        ? await prisma.driveConnection.findMany({
            where: {
              id: { in: sources.map((source) => source.driveConnectionId) },
              emailAccountId,
              isConnected: true,
            },
            select: { id: true },
          })
        : [];

      const validConnectionIds = new Set(driveConnections.map((c) => c.id));

      for (const source of sources) {
        if (!validConnectionIds.has(source.driveConnectionId)) {
          throw new SafeError("Drive connection not found");
        }
      }

      const existingSources = await prisma.attachmentSource.findMany({
        where: { ruleId },
        select: {
          id: true,
          driveConnectionId: true,
          type: true,
          sourceId: true,
          name: true,
          sourcePath: true,
        },
      });

      const existingSourceByKey = new Map(
        existingSources.map((source) => [getSourceKey(source), source]),
      );
      const nextSourcesByKey = new Map(
        sources.map((source) => [getSourceKey(source), source]),
      );

      const sourceIdsToDelete = existingSources
        .filter((source) => !nextSourcesByKey.has(getSourceKey(source)))
        .map((source) => source.id);

      const sourcesToCreate = sources.filter(
        (source) => !existingSourceByKey.has(getSourceKey(source)),
      );
      const sourcesToUpdate = sources.flatMap((source) => {
        const existing = existingSourceByKey.get(getSourceKey(source));

        if (
          !existing ||
          (existing.name === source.name &&
            existing.sourcePath === (source.sourcePath ?? null))
        ) {
          return [];
        }

        return [{ next: source, existing }];
      });

      if (sourceIdsToDelete.length > 0) {
        await prisma.attachmentSource.deleteMany({
          where: { id: { in: sourceIdsToDelete } },
        });
      }

      await Promise.all(
        sourcesToUpdate.map((source) =>
          prisma.attachmentSource.update({
            where: { id: source.existing.id },
            data: {
              name: source.next.name,
              sourcePath: source.next.sourcePath ?? null,
            },
          }),
        ),
      );

      if (sourcesToCreate.length > 0) {
        await prisma.attachmentSource.createMany({
          data: sourcesToCreate.map((source) => ({
            ...source,
            sourcePath: source.sourcePath ?? null,
            ruleId,
          })),
        });
      }

      return { count: sources.length };
    },
  );

function getSourceKey(source: {
  driveConnectionId: string;
  type: string;
  sourceId: string;
}) {
  return `${source.driveConnectionId}:${source.type}:${source.sourceId}`;
}
