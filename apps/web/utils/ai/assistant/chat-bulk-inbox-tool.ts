import { type InferUITool, tool } from "ai";
import { z } from "zod";
import {
  gmailSearchQuerySchema,
  outlookSearchFilterFields,
  resolveThreadLabel,
} from "@/utils/ai/assistant/chat-inbox-tools";
import { hideToolErrorFromUser } from "@/utils/ai/assistant/tool-error-visibility";
import type {
  BulkInboxActionSearch,
  BulkInboxActionType,
} from "@/utils/bulk-inbox-action/validation";
import { searchBulkInboxActionPage } from "@/utils/bulk-inbox-action/search";
import { createEmailProvider } from "@/utils/email/provider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import type { Logger } from "@/utils/logger";
import { posthogCaptureEvent } from "@/utils/posthog";
import { aiFilterEmailsForBulkAction } from "@/utils/ai/bulk-inbox-action/filter-emails";
import type { ParsedMessage } from "@/utils/types";
import { getEmailAccountWithAi } from "@/utils/user/get";

const ESTIMATE_PAGE_SIZE = 50;
const ESTIMATE_MAX_PAGES = 3;
const SAMPLE_COUNT = 5;
// One economy call on the first matches previews what the instruction keeps.
const PREVIEW_FILTER_SIZE = 25;

const instructionSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .optional()
  .describe(
    'Optional plain-language test each matching email must pass, such as "newsletters I never read". AI judges every email against it and only acts on those that pass. Use it when the search alone cannot express which emails qualify; omit it when every search match should be acted on.',
  );

const gmailBulkInboxInputSchema = z.object({
  query: gmailSearchQuerySchema
    .min(1)
    .describe(
      "Gmail search query selecting the emails, with the same syntax as searchInbox. Include in:inbox when the cleanup is about the inbox.",
    ),
  action: z
    .enum([
      "archive_threads",
      "trash_threads",
      "mark_read_threads",
      "label_threads",
    ])
    .describe(
      "Action applied to every matching thread. label_threads applies an existing label.",
    ),
  labelName: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Exact existing Gmail label name. Required for label_threads; omit for other actions.",
    ),
  instruction: instructionSchema,
});

const outlookBulkInboxInputSchema = z
  .object({
    ...outlookSearchFilterFields,
    action: z
      .enum([
        "archive_threads",
        "trash_threads",
        "mark_read_threads",
        "categorize_threads",
      ])
      .describe(
        "Action applied to every matching thread. categorize_threads applies an existing category.",
      ),
    applyCategoryName: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Exact existing Outlook category to apply. Required for categorize_threads; omit for other actions. categoryName only filters the search.",
      ),
    instruction: instructionSchema,
  })
  .refine(
    (value) =>
      Boolean(
        value.query ||
          value.fromEmail ||
          value.readState ||
          value.categoryName ||
          value.folderName,
      ),
    {
      message:
        "query, fromEmail, readState, categoryName, or folderName is required",
    },
  );

type BulkInboxToolOptions = {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
};

const description = (searchToolTerms: string) =>
  `Apply one action to every email that matches a search, across all result pages, as a background job. Use this instead of paging searchInbox and calling manageInbox when the cleanup covers more than one search page or "all" emails of some kind. For a handful of emails already found, use manageInbox.

Before calling, search to check the ${searchToolTerms} returns the intended emails, and ask the user about anything unclear. Add instruction when the search alone cannot separate which emails qualify. Only use trash_threads when the user explicitly asks to delete or trash.

Nothing changes when this is called: it returns a card with an estimate and examples, and the user must confirm in the UI before the job starts. The card shows those details, asks for confirmation and updates as the job runs, so don't restate them, and don't describe the action as waiting or done, which goes stale once the user acts. At most add one short line. Once confirmed, the job's progress and totals appear in later context; report those numbers, not estimates.`;

const gmailBulkInboxTool = (options: BulkInboxToolOptions) =>
  tool({
    description: description("query"),
    inputSchema: gmailBulkInboxInputSchema,
    execute: async (input) =>
      prepareBulkInboxAction({
        options,
        search: { query: input.query },
        action: input.action,
        labelName: input.labelName,
        instruction: input.instruction,
      }),
  });

const outlookBulkInboxTool = (options: BulkInboxToolOptions) =>
  tool({
    description: description("same filters"),
    inputSchema: outlookBulkInboxInputSchema,
    execute: async (input) =>
      prepareBulkInboxAction({
        options,
        search: {
          query: input.query,
          fromEmail: input.fromEmail,
          readState: input.readState,
          categoryName: input.categoryName,
          folderName: input.folderName,
        },
        action:
          input.action === "categorize_threads"
            ? "label_threads"
            : input.action,
        labelName: input.applyCategoryName,
        instruction: input.instruction,
      }),
  });

export const bulkManageInboxTool = (options: BulkInboxToolOptions) =>
  isGoogleProvider(options.provider)
    ? gmailBulkInboxTool(options)
    : outlookBulkInboxTool(options);

export type BulkManageInboxTool = InferUITool<
  ReturnType<typeof gmailBulkInboxTool>
>;

async function prepareBulkInboxAction({
  options: { email, emailAccountId, provider, logger },
  search,
  action,
  labelName,
  instruction,
}: {
  options: BulkInboxToolOptions;
  search: BulkInboxActionSearch;
  action: BulkInboxActionType;
  labelName?: string;
  instruction?: string;
}) {
  logger.info("Tracking tool call", { tool: "bulk_inbox_action", email });
  posthogCaptureEvent(email, "AI Assistant Chat Tool Call", {
    tool: "bulk_inbox_action",
  });

  if (action === "label_threads" && !labelName) {
    return hideToolErrorFromUser({
      error: isGoogleProvider(provider)
        ? "labelName is required for label_threads."
        : "applyCategoryName is required for categorize_threads.",
    });
  }

  try {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });

    const label =
      action === "label_threads" && labelName
        ? await resolveThreadLabel({
            emailProvider,
            labelName,
            action,
            // A bulk write must hit exactly the label the user named.
            matchNestedLabels: false,
            missingLabelError: (name) =>
              `"${name}" does not exist. Create it first if the user wants it.`,
          }).catch((error: unknown) => ({
            error: error instanceof Error ? error.message : "Label not found",
          }))
        : null;
    if (label && "error" in label) return hideToolErrorFromUser(label);

    const threads: ParsedMessage[] = [];
    const threadIds = new Set<string>();
    let pageToken: string | undefined;
    let hasMore = false;

    for (let pageIndex = 0; pageIndex < ESTIMATE_MAX_PAGES; pageIndex++) {
      const page = await searchBulkInboxActionPage({
        emailProvider,
        provider,
        search,
        pageToken,
        pageSize: ESTIMATE_PAGE_SIZE,
      });

      for (const message of page.messages) {
        if (!message.threadId || threadIds.has(message.threadId)) continue;
        threadIds.add(message.threadId);
        threads.push(message);
      }

      pageToken = page.nextPageToken;
      hasMore = Boolean(pageToken);
      if (!pageToken) break;
    }

    // Filtered Outlook searches can return empty pages before later matches.
    if (threadIds.size === 0 && !hasMore) {
      return {
        success: true,
        estimatedThreadCount: 0,
        message: "No emails match this search, so there is nothing to do.",
      };
    }

    const preview = instruction
      ? await previewInstruction({
          emailAccountId,
          instruction,
          threads: threads.slice(0, PREVIEW_FILTER_SIZE),
          logger,
        })
      : null;

    if (preview && preview.matches.length === 0) {
      return {
        success: true,
        estimatedThreadCount: 0,
        message: `None of the ${preview.checkedCount} emails checked match "${instruction}", so nothing was prepared and nothing changed.`,
      };
    }

    const matchingThreads = preview?.matches ?? threads;
    const estimatedThreadCount = preview
      ? Math.max(
          preview.matches.length,
          Math.round(
            (threadIds.size * preview.matches.length) / preview.checkedCount,
          ),
        )
      : threadIds.size;

    return {
      success: true,
      actionType: "bulk_inbox_action" as const,
      requiresConfirmation: true as const,
      confirmationState: "pending" as const,
      pendingAction: {
        search,
        action,
        labelId: label?.labelId ?? null,
        labelName: label?.labelName ?? null,
        instruction: instruction ?? null,
      },
      estimate: {
        threadCount: estimatedThreadCount,
        isApproximate: hasMore || Boolean(preview),
        searchThreadCount: threadIds.size,
      },
      matchSummary: preview?.matchSummary ?? null,
      samples: matchingThreads.slice(0, SAMPLE_COUNT).map((message) => ({
        from: message.headers.from,
        subject: message.headers.subject,
        date: message.date,
      })),
      nextStep:
        "Nothing has changed yet. The card handles confirmation and progress.",
    };
  } catch (error) {
    logger.error("Failed to prepare bulk inbox action", { error });
    return { error: "Failed to search the inbox for this bulk action." };
  }
}

// Without a working preview the card falls back to the unfiltered search, and
// the job still filters every email.
async function previewInstruction({
  emailAccountId,
  instruction,
  threads,
  logger,
}: {
  emailAccountId: string;
  instruction: string;
  threads: ParsedMessage[];
  logger: Logger;
}) {
  try {
    const emailAccount = await getEmailAccountWithAi({ emailAccountId });
    if (!emailAccount) return null;
    const { matchingIds, matchSummary } = await aiFilterEmailsForBulkAction({
      emailAccount,
      instruction,
      messages: threads,
      describeMatches: true,
    });
    return {
      matches: threads.filter((message) => matchingIds.has(message.id)),
      matchSummary,
      checkedCount: threads.length,
    };
  } catch (error) {
    logger.warn("Failed to preview bulk inbox action instruction", { error });
    return null;
  }
}
