import type { CategoryWithRules } from "@/utils/category.server";

export type EmailGroup = {
  address: string;
  category: CategoryWithRules | null;
};

export type ConfidenceLevel = "high" | "medium" | "low";

export type ArchiveCandidate = {
  address: string;
  category: CategoryWithRules | null;
  confidence: ConfidenceLevel;
  reason: string;
};

/**
 * Classifies email senders into archive confidence levels based on their category.
 * - High confidence: marketing, promotions, newsletters, sales
 * - Medium confidence: notifications, alerts, receipts, updates
 * - Low confidence: everything else
 */
export function getArchiveCandidates(
  emailGroups: EmailGroup[],
): ArchiveCandidate[] {
  return emailGroups.map((group) => {
    const categoryName = group.category?.name?.toLowerCase() || "";

    // High confidence: marketing, promotions, newsletters
    if (
      categoryName.includes("marketing") ||
      categoryName.includes("promotion") ||
      categoryName.includes("newsletter") ||
      categoryName.includes("sale")
    ) {
      return {
        ...group,
        confidence: "high" as ConfidenceLevel,
        reason: "Marketing / Promotional",
      };
    }

    // Medium confidence: notifications, receipts, automated
    if (
      categoryName.includes("notification") ||
      categoryName.includes("alert") ||
      categoryName.includes("receipt") ||
      categoryName.includes("update")
    ) {
      return {
        ...group,
        confidence: "medium" as ConfidenceLevel,
        reason: "Automated notification",
      };
    }

    // Low confidence: everything else
    return {
      ...group,
      confidence: "low" as ConfidenceLevel,
      reason: "Infrequent sender",
    };
  });
}
