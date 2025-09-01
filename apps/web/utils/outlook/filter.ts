import type { OutlookClient } from "@/utils/outlook/client";
import type {
  MessageRule,
  OutlookCategory,
} from "@microsoft/microsoft-graph-types";
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
  const { client, from, removeLabelIds } = options;

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
        // Categories would need to be handled separately
      },
    };

    const response: MessageRule = await client
      .getClient()
      .api("/me/mailFolders/inbox/messageRules")
      .post(rule);

    return { status: 201, data: response };
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
  labelName,
}: {
  client: OutlookClient;
  from: string;
  labelName?: string;
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

    const response: MessageRule = await client
      .getClient()
      .api("/me/mailFolders/inbox/messageRules")
      .post(rule);

    return { status: 201, data: response };
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
    await client
      .getClient()
      .api(`/me/mailFolders/inbox/messageRules/${id}`)
      .delete();

    return { status: 204 };
  } catch (error) {
    logger.error("Error deleting Outlook filter", { id, error });
    throw error;
  }
}

export async function getFiltersList(options: { client: OutlookClient }) {
  try {
    const response: { value: MessageRule[] } = await options.client
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

// Helper function to check if a filter already exists
function isFilterExistsError(error: unknown) {
  // biome-ignore lint/suspicious/noExplicitAny: simplest
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
    const categories: { value: OutlookCategory[] } = await client
      .getClient()
      .api("/me/outlook/masterCategories")
      .get();

    let category = categories.value.find(
      (cat) => cat.displayName === categoryName,
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
      categoryId: category?.id,
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

    const response: MessageRule = await client
      .getClient()
      .api(`/me/mailFolders/inbox/messageRules/${id}`)
      .patch(rule);

    return response;
  } catch (error) {
    logger.error("Error updating Outlook filter", { id, error });
    throw error;
  }
}
