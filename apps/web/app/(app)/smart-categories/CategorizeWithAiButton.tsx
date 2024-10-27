"use client";

import { useState } from "react";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categorizeSendersAction } from "@/utils/actions/categorize";
import { toast } from "sonner";
import { handleActionCall } from "@/utils/server-action";
import { isActionError } from "@/utils/error";

export function CategorizeWithAiButton() {
  const [isCategorizing, setIsCategorizing] = useState(false);

  return (
    <Button
      type="button"
      disabled={isCategorizing}
      onClick={async () => {
        if (isCategorizing) return;
        toast.promise(
          async () => {
            setIsCategorizing(true);
            const result = await handleActionCall(
              "categorizeSendersAction",
              categorizeSendersAction,
            );

            if (isActionError(result)) {
              setIsCategorizing(false);
              throw new Error(result.error);
            }

            setIsCategorizing(false);

            return result;
          },
          {
            loading: "Categorizing senders...",
            success: () => {
              return "Senders categorized successfully!";
            },
            error: (err) => {
              return `Error categorizing senders: ${err.message}`;
            },
          },
        );
      }}
      loading={isCategorizing}
    >
      <SparklesIcon className="mr-2 size-4" />
      Categorize Senders with AI
    </Button>
  );
}
