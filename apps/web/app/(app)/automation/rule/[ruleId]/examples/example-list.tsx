"use client";

import { useState } from "react";
import clsx from "clsx";
import type { Dictionary } from "lodash";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteGroupItemAction } from "@/utils/actions/group";
import type { MessageWithGroupItem } from "@/app/(app)/automation/rule/[ruleId]/examples/types";
import { isActionError } from "@/utils/error";
import { toastError } from "@/components/Toast";

export function ExampleList({
  groupedBySenders,
}: {
  groupedBySenders: Dictionary<MessageWithGroupItem[][]>;
}) {
  const [removed, setRemoved] = useState<string[]>([]);

  return Object.entries(groupedBySenders).map(([from, threads]) => {
    const matchingGroupItem = threads[0]?.[0]?.matchingGroupItem;

    const firstThreadId = threads[0]?.[0]?.id;

    if (removed.includes(firstThreadId)) return null;

    return (
      <Card key={from}>
        <CardHeader>
          <CardTitle>{from}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className={clsx(threads.length > 1 && "list-inside list-disc")}>
            {threads.map((t) => (
              <li key={t[0]?.id}>{t[0]?.headers.subject}</li>
            ))}
          </ul>
          {!!matchingGroupItem && (
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                const result = deleteGroupItemAction(matchingGroupItem.id);
                if (isActionError(result)) {
                  toastError({
                    description: `Failed to remove ${matchingGroupItem.value} from group. ${result.error}`,
                  });
                } else {
                  setRemoved([...removed, firstThreadId]);
                }
              }}
            >
              Remove {matchingGroupItem.type}: {matchingGroupItem.value}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  });
}
