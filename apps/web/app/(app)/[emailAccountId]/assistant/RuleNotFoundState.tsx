"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export function RuleNotFoundState() {
  return (
    <Empty className="min-h-56 border">
      <EmptyHeader>
        <EmptyTitle>Rule not found</EmptyTitle>
        <EmptyDescription>
          This rule no longer exists. It may have been deleted.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
