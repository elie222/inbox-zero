"use client";

import { useEffect, useState } from "react";
import { ProgressPanel } from "@/components/ProgressPanel";
import { useBulkOperationProgress } from "@/hooks/useDeepClean";

export function BulkOperationProgress() {
  const [hasActiveOperations, setHasActiveOperations] = useState(false);

  const { data } = useBulkOperationProgress(
    hasActiveOperations ? 2000 : 10_000, // Poll more frequently when operations are active
  );

  const operations = data?.operations || [];
  const activeOperations = operations.filter(
    (op) => op.status === "processing" || op.status === "pending",
  );

  useEffect(() => {
    setHasActiveOperations(activeOperations.length > 0);
  }, [activeOperations.length]);

  // Show progress for each active operation
  return (
    <>
      {operations.map((operation) => {
        const isActive =
          operation.status === "processing" || operation.status === "pending";
        const isCompleted = operation.status === "completed";

        if (!isActive && !isCompleted) return null;

        // Hide completed operations after 5 seconds
        if (isCompleted) {
          setTimeout(() => {
            // This will be handled by React's re-render when the operation is removed from Redis
          }, 5000);
        }

        const displayName =
          operation.operationType === "archive"
            ? `Archiving ${operation.categoryOrSender}`
            : `Marking ${operation.categoryOrSender} as read`;

        const completedText =
          operation.operationType === "archive"
            ? `Archived ${operation.completedItems} emails!`
            : `Marked ${operation.completedItems} emails as read!`;

        return (
          <ProgressPanel
            key={operation.operationId}
            totalItems={operation.totalItems}
            remainingItems={operation.totalItems - operation.completedItems}
            inProgressText={displayName}
            completedText={completedText}
            itemLabel="emails"
          />
        );
      })}
    </>
  );
}
