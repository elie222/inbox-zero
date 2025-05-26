"use client";

import { useState } from "react";
import clsx from "clsx";
import type { Dictionary } from "lodash";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteGroupItemAction } from "@/utils/actions/group";
import type { MessageWithGroupItem } from "@/app/(app)/[emailAccountId]/assistant/rule/[ruleId]/examples/types";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";

export function ExampleList({
  groupedBySenders,
}: {
  groupedBySenders: Dictionary<MessageWithGroupItem[][]>;
}) {
  const [removed, setRemoved] = useState<string[]>([]);
  const { emailAccountId } = useAccount();

  return (
    <div className="mx-auto my-2 grid max-w-4xl gap-2 px-2 sm:my-4 sm:gap-4 sm:px-4">
      {Object.entries(groupedBySenders).map(([from, threads]) => {
        const matchingGroupItem = threads[0]?.[0]?.matchingGroupItem;

        const firstThreadId = threads[0]?.[0]?.id;

        if (removed.includes(firstThreadId)) return null;

        return (
          <Card key={from}>
            <CardHeader>
              <CardTitle
                className="break-words text-lg sm:text-2xl"
                style={{ overflowWrap: "anywhere" }}
              >
                {from}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul
                className={clsx(threads.length > 1 && "list-inside list-disc")}
              >
                {threads.map((t) => (
                  <li key={t[0]?.id}>{t[0]?.headers.subject}</li>
                ))}
              </ul>
              {!!matchingGroupItem && (
                <Button
                  type="submit"
                  size="sm"
                  className="mt-4 text-wrap"
                  onClick={async () => {
                    const result = await deleteGroupItemAction(emailAccountId, {
                      id: matchingGroupItem.id,
                    });
                    if (result?.serverError) {
                      toastError({
                        description: `Failed to remove ${matchingGroupItem.value} from group. ${result.serverError || ""}`,
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
      })}
    </div>
  );
}
