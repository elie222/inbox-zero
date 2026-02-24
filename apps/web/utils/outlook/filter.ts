import type { OutlookClient } from "@/utils/outlook/client";
import type { MessageRule } from "@microsoft/microsoft-graph-types";
import type { Logger } from "@/utils/logger";
import { isAlreadyExistsError } from "./errors";
import { withOutlookRetry } from "@/utils/outlook/retry";
import { getLabelById, getOrCreateLabel } from "@/utils/outlook/label";

// Microsoft Graph API doesn't have a direct equivalent to Gmail filters
// Instead, we can work with mail rules which are more complex but provide similar functionality
// Note: Mail rules in Outlook are more limited and require different permissions

export async function createFilter(options: {
  client: OutlookClient;
  from: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
  logger: Logger;
}) {
  const { client, from, addLabelIds, removeLabelIds, logger } = options;

  try {
    const actions = await buildFilterActions({
      client,
      addLabelIds,
      removeLabelIds,
      context: { from },
      logger,
    });

    const rule: MessageRule = {
      displayName: `Filter for ${from}`,
      sequence: 1,
      isEnabled: true,
      conditions: {
        senderContains: [from],
      },
      actions,
    };

    const response: MessageRule = await withOutlookRetry(
      () =>
        client.getClient().api("/me/mailFolders/inbox/messageRules").post(rule),
      logger,
    );

    return { status: 201, data: response };
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      logger.warn("Filter already exists", { from });
      return { status: 200 };
    }
    throw error;
  }
}

export async function createAutoArchiveFilter({
  client,
  from,
  labelName,
  logger,
}: {
  client: OutlookClient;
  from: string;
  labelName?: string;
  logger: Logger;
}) {
  try {
    // For Outlook, we'll create a rule that moves messages to archive
    const rule: MessageRule = {
      displayName: `Auto-archive filter for ${from}`,
      sequence: 1,
      isEnabled: true,
      conditions: {
        senderContains: [from],
      },
      actions: {
        moveToFolder: "archive",
        markAsRead: true,
        ...(labelName && { assignCategories: [labelName] }),
      },
    };

    const response: MessageRule = await withOutlookRetry(
      () =>
        client.getClient().api("/me/mailFolders/inbox/messageRules").post(rule),
      logger,
    );

    return { status: 201, data: response };
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      logger.warn("Auto-archive filter already exists", { from });
      return { status: 200 };
    }
    throw error;
  }
}

export async function deleteFilter({
  client,
  id,
  logger,
}: {
  client: OutlookClient;
  id: string;
  logger: Logger;
}) {
  try {
    await withOutlookRetry(
      () =>
        client
          .getClient()
          .api(`/me/mailFolders/inbox/messageRules/${id}`)
          .delete(),
      logger,
    );

    return { status: 204 };
  } catch (error) {
    logger.error("Error deleting Outlook filter", { id, error });
    throw error;
  }
}

export async function getFiltersList({
  client,
  logger,
}: {
  client: OutlookClient;
  logger: Logger;
}) {
  try {
    const response: { value: MessageRule[] } = await client
      .getClient()
      .api("/me/mailFolders/inbox/messageRules")
      .get();

    return response;
  } catch (error) {
    logger.error("Error getting Outlook filters list", {
      error,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

// Additional helper functions for Outlook-specific operations

export async function createCategoryFilter({
  client,
  from,
  categoryName,
  logger,
}: {
  client: OutlookClient;
  from: string;
  categoryName: string;
  logger: Logger;
}) {
  const category = await getOrCreateLabel({
    client,
    name: categoryName,
    logger,
  });

  // Note: Microsoft Graph API doesn't support applying categories directly in mail rules
  // This function ensures the category exists; assignment happens when processing messages
  logger.info("Category ensured for filter", {
    categoryName: category.displayName,
    categoryId: category.id,
  });
  logger.trace("Category ensure filter context", { from });

  return {
    status: 200,
    category,
    message:
      "Category ensured. Note: Categories must be applied to individual messages.",
  };
}

export async function updateFilter({
  client,
  id,
  from,
  addLabelIds,
  removeLabelIds,
  logger,
}: {
  client: OutlookClient;
  id: string;
  from: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
  logger: Logger;
}) {
  try {
    const actions = await buildFilterActions({
      client,
      addLabelIds,
      removeLabelIds,
      context: { id, from },
      logger,
    });

    const rule: MessageRule = {
      displayName: `Filter for ${from}`,
      sequence: 1,
      isEnabled: true,
      conditions: {
        senderContains: [from],
      },
      actions,
    };

    const response: MessageRule = await withOutlookRetry(
      () =>
        client
          .getClient()
          .api(`/me/mailFolders/inbox/messageRules/${id}`)
          .patch(rule),
      logger,
    );

    return response;
  } catch (error) {
    logger.error("Error updating Outlook filter", { id, error });
    throw error;
  }
}

// Helper functions

/**
 * Resolves label IDs to category names for Outlook rules.
 * Outlook rules use category names, not IDs.
 */
async function resolveCategoryNames(
  client: OutlookClient,
  labelIds: string[],
  logger: Logger,
): Promise<string[]> {
  const categoryNames: string[] = [];

  for (const labelId of labelIds) {
    try {
      const category = await getLabelById({ client, id: labelId });
      if (category?.displayName) {
        categoryNames.push(category.displayName);
      } else {
        logger.error("Category not found by ID", { labelId });
      }
    } catch (error) {
      logger.error("Failed to resolve category ID", {
        labelId,
        error,
      });
    }
  }

  return categoryNames;
}

/**
 * Builds the actions object for Outlook message rules.
 * Microsoft API requires at least one action.
 */
async function buildFilterActions(options: {
  client: OutlookClient;
  addLabelIds?: string[];
  removeLabelIds?: string[];
  context?: Record<string, unknown>;
  logger: Logger;
}): Promise<{
  moveToFolder?: string;
  markAsRead?: boolean;
  assignCategories?: string[];
}> {
  const { client, addLabelIds, removeLabelIds, context = {}, logger } = options;
  const actions: {
    moveToFolder?: string;
    markAsRead?: boolean;
    assignCategories?: string[];
  } = {};

  // Handle label additions (categories in Outlook)
  if (addLabelIds && addLabelIds.length > 0) {
    const categoryNames = await resolveCategoryNames(
      client,
      addLabelIds,
      logger,
    );
    if (categoryNames.length > 0) {
      actions.assignCategories = categoryNames;
    }
  }

  // Handle label removals
  if (removeLabelIds?.includes("INBOX")) {
    actions.moveToFolder = "archive";
  }

  if (removeLabelIds?.includes("UNREAD")) {
    actions.markAsRead = true;
  }

  // If no actions were specified, default to marking as read
  // (Microsoft API requires at least one action)
  if (Object.keys(actions).length === 0) {
    logger.warn("No actions specified for filter, defaulting to markAsRead", {
      addLabelIds,
      removeLabelIds,
      ...context,
    });
    actions.markAsRead = true;
  }

  return actions;
}
