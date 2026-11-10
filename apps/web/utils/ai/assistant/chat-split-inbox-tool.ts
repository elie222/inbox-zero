import { type InferUITool, tool } from "ai";
import { z } from "zod";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
import {
  createMailSplitBody,
  updateMailSplitBody,
} from "@/utils/actions/mail-split.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { posthogCaptureEvent } from "@/utils/posthog";
import prisma from "@/utils/prisma";
import { getMailSettings } from "@/utils/split-inbox/settings.server";
import {
  MAX_SPLIT_FILTERS,
  type MailSplitFilterDraft,
} from "@/utils/split-inbox/split-filters";
import {
  createMailSplitOrThrow,
  updateMailSplit,
} from "@/utils/split-inbox/splits.server";
import { OLDER_THAN_OPTIONS } from "@/utils/split-inbox/split-query";

const conditionKinds = [
  MailSplitFilterKind.FROM,
  MailSplitFilterKind.TO,
  MailSplitFilterKind.LABEL,
  MailSplitFilterKind.CATEGORY,
  MailSplitFilterKind.UNREAD,
  MailSplitFilterKind.STARRED,
  MailSplitFilterKind.OLDER_THAN,
] as const;

const manageSplitInboxInputSchema = z.object({
  action: z
    .enum(["list", "create", "update", "delete"])
    .describe(
      "list: show the user's splits with their ids and conditions. create: add a split. update: change a split's name, matching or conditions. delete: ask the user to confirm removing a split.",
    ),
  splitId: z
    .string()
    .trim()
    .min(1)
    .nullish()
    .describe("Required for update and delete: a split id from list."),
  name: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .nullish()
    .describe(
      "The tab name, a few words. Required for create; for update, omit to keep the current name.",
    ),
  matchAll: z
    .boolean()
    .nullish()
    .describe(
      "true (default): mail must meet every condition. false: any one condition is enough; required when there are several FROM or several TO conditions. For update, omit to keep the current setting.",
    ),
  conditions: z
    .array(
      z.object({
        kind: z.enum(conditionKinds),
        value: z
          .string()
          .trim()
          .min(1)
          .nullish()
          .describe(
            `FROM (sender) and TO (recipient in To or Cc): an email address or @domain.com. LABEL: the exact name of one of the user's existing labels. OLDER_THAN: one of ${OLDER_THAN_OPTIONS.map((option) => option.value).join(", ")}. CATEGORY: only to keep a category condition, copying its value from list. UNREAD and STARRED take no value.`,
          ),
      }),
    )
    .max(MAX_SPLIT_FILTERS)
    .nullish()
    .describe(
      "Required for create; for update, the full replacement list, or omit to keep the current conditions.",
    ),
});

export const manageSplitInboxTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Read and change the user's split inbox: the tabs on the mail screen that each show the slice of the inbox matching some conditions, such as mail from a sender, mail sent to an address or domain, or mail with a label. A split only filters what a tab shows; it never moves, labels or changes mail, so create and update apply right away without asking first, and the mail screen switches to a split after it is created or updated. delete only shows the user a confirmation card: the split stays until they confirm it there. The All tab and the Other tab (inbox mail no other split matches) are built in and cannot be changed. Use list before update or delete to get the split id.",
    inputSchema: manageSplitInboxInputSchema,
    execute: async (input) => {
      logger.info("Tracking tool call", { tool: "manage_split_inbox", email });
      posthogCaptureEvent(email, "AI Assistant Chat Tool Call", {
        tool: "manage_split_inbox",
        action: input.action,
      });

      const labels = createLabelDirectory({ emailAccountId, provider, logger });

      try {
        switch (input.action) {
          case "list": {
            const { splits } = await getMailSettings({ emailAccountId });
            return {
              success: true as const,
              splits: await Promise.all(
                splits
                  .filter((split) => split.filters.length)
                  .map(async (split) => ({
                    id: split.id,
                    name: split.name,
                    matchAll: split.matchAll,
                    conditions: await Promise.all(
                      split.filters.map(async (filter) => ({
                        kind: filter.kind,
                        value:
                          filter.kind === MailSplitFilterKind.LABEL &&
                          filter.value
                            ? ((await labels.nameFor(filter.value)) ??
                              filter.value)
                            : filter.value,
                      })),
                    ),
                  })),
              ),
            };
          }
          case "create": {
            if (!input.name || !input.conditions?.length)
              return failure("create requires a name and conditions.");
            const body = createMailSplitBody.safeParse({
              name: input.name,
              matchAll: input.matchAll ?? true,
              filters: await toFilters(input.conditions, labels, provider),
            });
            if (!body.success) return failure(firstIssue(body.error));
            const split = await createMailSplitOrThrow({
              emailAccountId,
              ...body.data,
            });
            return {
              success: true as const,
              action: "create" as const,
              split: { id: split.id, name: split.name },
            };
          }
          case "update": {
            if (!input.splitId) return failure("update requires a splitId.");
            const current = await prisma.mailSplit.findFirst({
              where: { id: input.splitId, emailAccountId },
              select: {
                name: true,
                matchAll: true,
                filters: {
                  orderBy: { order: "asc" },
                  select: { kind: true, value: true },
                },
              },
            });
            if (!current?.filters.length)
              return failure("Split not found or cannot be changed.");
            const body = updateMailSplitBody.safeParse({
              id: input.splitId,
              name: input.name ?? current.name,
              matchAll: input.matchAll ?? current.matchAll,
              filters: input.conditions
                ? await toFilters(input.conditions, labels, provider)
                : current.filters,
            });
            if (!body.success) return failure(firstIssue(body.error));
            if (!body.data.filters.length)
              return failure(
                "A split needs at least one condition. Delete it instead.",
              );
            await updateMailSplit({ emailAccountId, ...body.data });
            return {
              success: true as const,
              action: "update" as const,
              split: { id: body.data.id, name: body.data.name },
            };
          }
          case "delete": {
            if (!input.splitId) return failure("delete requires a splitId.");
            const split = await prisma.mailSplit.findFirst({
              where: {
                id: input.splitId,
                emailAccountId,
                filters: { some: {} },
              },
              select: { id: true, name: true },
            });
            if (!split) return failure("Split not found or cannot be removed.");
            // A deleted split can't be restored, so the user confirms it.
            return {
              success: true as const,
              action: "delete" as const,
              requiresConfirmation: true as const,
              pendingDelete: split,
            };
          }
        }
      } catch (error) {
        if (error instanceof SafeError) return failure(error.message);
        logger.error("Failed to manage split inbox", {
          error,
          action: input.action,
        });
        return failure("Failed to update the split inbox.");
      }
    },
  });

export type ManageSplitInboxTool = InferUITool<
  ReturnType<typeof manageSplitInboxTool>
>;

async function toFilters(
  conditions: NonNullable<
    z.infer<typeof manageSplitInboxInputSchema>["conditions"]
  >,
  labels: ReturnType<typeof createLabelDirectory>,
  provider: string,
): Promise<MailSplitFilterDraft[]> {
  const filters: MailSplitFilterDraft[] = [];
  for (const { kind, value } of conditions) {
    if (kind === MailSplitFilterKind.STARRED && isMicrosoftProvider(provider))
      throw new SafeError("Starred splits aren't available for Outlook.");
    if (kind !== MailSplitFilterKind.LABEL) {
      filters.push({ kind, value: value ?? null });
      continue;
    }
    const labelId = value ? await labels.idFor(value) : null;
    if (!labelId)
      throw new SafeError(
        `There is no label named "${value ?? ""}". Use one of the user's existing labels.`,
      );
    filters.push({ kind, value: labelId });
  }
  return filters;
}

/** Labels are fetched once per call, and only when a condition needs them. */
function createLabelDirectory({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  let labels: Promise<{ id: string; name: string }[]> | undefined;
  const load = () => {
    labels ??= createEmailProvider({ emailAccountId, provider, logger }).then(
      (emailProvider) => emailProvider.getLabels({ includeHidden: true }),
    );
    return labels;
  };
  return {
    // Listing still works with raw ids if labels can't be fetched.
    nameFor: async (id: string) =>
      (await load().catch(() => [])).find((label) => label.id === id)?.name,
    // An exact name or id wins over a case-insensitive name, so labels that
    // differ only in case can't be confused.
    idFor: async (nameOrId: string) => {
      const all = await load();
      const exact = all.find(
        (label) => label.name === nameOrId || label.id === nameOrId,
      );
      if (exact) return exact.id;
      const loose = all.filter(
        (label) => label.name.toLowerCase() === nameOrId.toLowerCase(),
      );
      return loose.length === 1 ? loose[0].id : undefined;
    },
  };
}

function failure(error: string) {
  return { success: false as const, error };
}

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid split.";
}
