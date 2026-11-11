"use client";

import { Trans } from "@lingui/react/macro";
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
        <EmptyTitle>
          <Trans>Rule not found</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>This rule no longer exists. It may have been deleted.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
