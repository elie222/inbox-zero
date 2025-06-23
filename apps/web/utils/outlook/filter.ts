import type { OutlookClient } from "@/utils/outlook/client";
import type { MessageRule } from "@microsoft/microsoft-graph-types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("outlook/filter");

// Microsoft Graph API doesn't have a direct equivalent to Gmail filters
// Instead, we can work with mail rules which are more complex but provide similar functionality
// Note: Mail rules in Outlook are more limited and require different permissions

export async function createFilter(options: {
  client: OutlookClient;
  from: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}) {
  const { client, from, addLabelIds, removeLabelIds } = options;

  try {
    // Create a mail rule that moves messages from specific sender
    const rule: MessageRule = {
      displayName: `Filter for ${from}`,
      sequence: 1,
      isEnabled: true,
      conditions: {
        senderContains: [from],
      },
      actions: {
        moveToFolder: removeLabelIds?.includes("INBOX") ? "archive" : undefined,
        markAsRead: removeLabelIds?.includes("UNREAD") ? true : undefined,
        // Note: Outlook doesn't have a direct equivalent to Gmail's label system
        // Categories would need to be handled separately
      },
    };

    const response = await client
      .getClient()
      .api("/me/mailFolders/inbox/messageRules")
      .post(rule);

    return response;
  } catch (error) {
    if (isFilterExistsError(error)) {
      logger.warn("Filter already exists", { from });
      return { status: 200 };
    }
    throw error;
  }
}

export async function createAutoArchiveFilter({
  client,
  from,
}: {
  client: OutlookClient;
  from: string;
}) {
  try {
    // For Outlook, we'll create a rule that moves messages to archive
    // Note: gmailLabelId is not directly applicable in Outlook
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
      },
    };

    const response = await client
      .getClient()
      .api("/me/mailFolders/inbox/messageRules")
      .post(rule);

    return response;
  } catch (error) {
    if (isFilterExistsError(error)) {
      logger.warn("Auto-archive filter already exists", { from });
      return { status: 200 };
    }
    throw error;
  }
}

export async function deleteFilter(options: {
  client: OutlookClient;
  id: string;
}) {
  const { client, id } = options;

  try {
    return await client
      .getClient()
      .api(`/me/mailFolders/inbox/messageRules/${id}`)
      .delete();
  } catch (error) {
    logger.error("Error deleting Outlook filter", { id, error });
    throw error;
  }
}

export async function getFiltersList(options: { client: OutlookClient }) {
  try {
    logger.info("Getting Outlook filters list");

    // Try the simpler endpoint first
    let response;
    try {
      response = await options.client.getClient().api("/me/messageRules").get();

      logger.info("Successfully got filters from /me/messageRules");
    } catch (error) {
      logger.warn(
        "Failed to get filters from /me/messageRules, trying /me/mailFolders/inbox/messageRules",
        { error },
      );

      response = await options.client
        .getClient()
        .api("/me/mailFolders/inbox/messageRules")
        .get();

      logger.info(
        "Successfully got filters from /me/mailFolders/inbox/messageRules",
      );
    }

    logger.info("Outlook getFiltersList raw response", {
      response,
      responseKeys: Object.keys(response),
      hasValue: !!response.value,
      valueLength: response.value?.length || 0,
      valueType: typeof response.value,
      isArray: Array.isArray(response.value),
    });

    if (response.value) {
      response.value.forEach((filter: any, index: number) => {
        logger.info(`Filter ${index}:`, {
          id: filter.id,
          displayName: filter.displayName,
          conditions: filter.conditions,
          actions: filter.actions,
          isEnabled: filter.isEnabled,
          sequence: filter.sequence,
        });
      });
    }

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

// Helper function to check if a filter already exists
function isFilterExistsError(error: unknown) {
  const errorMessage = (error as any)?.message || "";
  return (
    errorMessage.includes("already exists") ||
    errorMessage.includes("duplicate") ||
    errorMessage.includes("conflict")
  );
}

// Additional helper functions for Outlook-specific operations

export async function createCategoryFilter({
  client,
  from,
  categoryName,
}: {
  client: OutlookClient;
  from: string;
  categoryName: string;
}) {
  try {
    // First, ensure the category exists
    const categories = await client
      .getClient()
      .api("/me/outlook/masterCategories")
      .get();

    let category = categories.value.find(
      (cat: any) => cat.displayName === categoryName,
    );

    if (!category) {
      // Create the category if it doesn't exist
      category = await client
        .getClient()
        .api("/me/outlook/masterCategories")
        .post({
          displayName: categoryName,
          color: "preset0", // Default color
        });
    }

    // Note: Microsoft Graph API doesn't support applying categories directly in mail rules
    // This function creates the category but the actual application would need to be done
    // when processing individual messages, similar to how it's done in the label functions

    logger.info("Category created for filter", {
      from,
      categoryName,
      categoryId: category.id,
    });

    return {
      status: 200,
      category,
      message:
        "Category created. Note: Categories must be applied to individual messages.",
    };
  } catch (error) {
    if (isFilterExistsError(error)) {
      logger.warn("Category filter already exists", { from, categoryName });
      return { status: 200 };
    }
    throw error;
  }
}

export async function updateFilter({
  client,
  id,
  from,
  addLabelIds,
  removeLabelIds,
}: {
  client: OutlookClient;
  id: string;
  from: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}) {
  try {
    const rule: MessageRule = {
      displayName: `Filter for ${from}`,
      sequence: 1,
      isEnabled: true,
      conditions: {
        senderContains: [from],
      },
      actions: {
        moveToFolder: removeLabelIds?.includes("INBOX") ? "archive" : undefined,
        markAsRead: removeLabelIds?.includes("UNREAD") ? true : undefined,
      },
    };

    const response = await client
      .getClient()
      .api(`/me/mailFolders/inbox/messageRules/${id}`)
      .patch(rule);

    return response;
  } catch (error) {
    logger.error("Error updating Outlook filter", { id, error });
    throw error;
  }
}
