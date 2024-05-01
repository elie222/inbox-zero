"use client";

import { useState } from "react";
import clsx from "clsx";
import { type Dictionary } from "lodash";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteGroupItemAction } from "@/utils/actions";
import { MessageWithGroupItem } from "@/app/(app)/automation/rule/[ruleId]/examples/types";

export function ExampleList({
  groupedBySenders,
}: {
  groupedBySenders: Dictionary<MessageWithGroupItem[][]>;
}) {
  const [removed, setRemoved] = useState<string[]>([]);

  return Object.entries(groupedBySenders).map(([from, threads]) => {
    const matchingGroupItemId = threads[0]?.[0]?.matchingGroupItem?.id;

    if (removed.includes(threads[0]?.[0]?.id)) return null;

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
          {!!matchingGroupItemId && (
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                deleteGroupItemAction(matchingGroupItemId);
                setRemoved([...removed, threads[0]?.[0]?.id]);
              }}
            >
              Remove
            </Button>
          )}
        </CardContent>
      </Card>
    );
  });
}
