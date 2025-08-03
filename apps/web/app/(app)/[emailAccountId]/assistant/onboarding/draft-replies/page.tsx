"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { TypographyH3, TypographyP } from "@/components/Typography";
import { ButtonListSurvey } from "@/components/ButtonListSurvey";
import { enableDraftRepliesAction } from "@/utils/actions/rule";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

export default function DraftRepliesPage() {
  const router = useRouter();
  const { emailAccountId } = useAccount();

  const onSetDraftReplies = useCallback(
    async (value: string) => {
      const result = await enableDraftRepliesAction(emailAccountId, {
        enable: value === "yes",
      });

      if (result?.serverError) {
        toastError({
          description: `There was an error: ${result.serverError || ""}`,
        });
      }

      router.push(
        prefixPath(emailAccountId, "/assistant/onboarding/completed"),
      );
    },
    [router, emailAccountId],
  );

  return (
    <div>
      <Card className="my-4 max-w-2xl p-6 sm:mx-4 md:mx-auto">
        <div className="text-center">
          <TypographyH3 className="mx-auto max-w-lg">
            Would you like our AI to automatically draft replies for you?
          </TypographyH3>

          <TypographyP className="mx-auto mt-4 max-w-sm text-muted-foreground">
            The drafts will appear in your inbox, written in your tone and
            style. You can edit them before sending.
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
