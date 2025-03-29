"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { TypographyH3, TypographyP } from "@/components/Typography";
import { ButtonListSurvey } from "@/components/ButtonListSurvey";

export default function DraftRepliesPage() {
  const router = useRouter();

  const onSetDraftReplies = useCallback(
    (value: string) => {
      if (value === "yes") {
        // enable draft replies
      }
      router.push("/automation/onboarding/completed");
    },
    [router],
  );

  return (
    <div>
      <Card className="my-4 max-w-2xl p-6 sm:mx-4 md:mx-auto">
        <div className="text-center">
          <TypographyH3 className="mx-auto max-w-lg">
            Would you like AI to draft your email replies?
          </TypographyH3>

          <TypographyP className="mx-auto mt-4 max-w-sm text-muted-foreground">
            AI will match your writing style and suggest drafts in Gmail. You
            control when and what to send.
          </TypographyP>

          <ButtonListSurvey
            className="mt-6"
            options={[
              {
                label: "Yes, draft replies",
                value: "yes",
              },
              {
                label: "No thanks",
                value: "no",
              },
            ]}
            onClick={onSetDraftReplies}
          />
        </div>
      </Card>
    </div>
  );
}
