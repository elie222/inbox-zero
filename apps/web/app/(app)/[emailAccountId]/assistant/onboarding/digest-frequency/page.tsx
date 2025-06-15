"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FrequencyPicker } from "@/app/(app)/[emailAccountId]/settings/FrequencyPicker";
import { useState } from "react";
import { updateDigestFrequencyAction } from "@/utils/actions/settings";
import { toastError, toastSuccess } from "@/components/Toast";
import { prefixPath } from "@/utils/path";
import type { SaveDigestFrequencyBody } from "@/utils/actions/settings.validation";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  markOnboardingAsCompleted,
  ASSISTANT_ONBOARDING_COOKIE,
} from "@/utils/cookies";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function DigestFrequencyPage() {
  const { emailAccountId } = useAccount();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showExampleDialog, setShowExampleDialog] = useState(false);
  const [digestFrequencyValue, setDigestFrequencyValue] = useState<
    SaveDigestFrequencyBody["userFrequency"]
  >({
    intervalDays: 7,
    daysOfWeek: 1 << (6 - 1), // Monday (1)
    timeOfDay: new Date(new Date().setHours(11, 0, 0, 0)), // 11 AM
    occurrences: 1,
  });

  const updateDigestFrequency = updateDigestFrequencyAction.bind(
    null,
    emailAccountId,
  );

  const handleFinish = async () => {
    if (!digestFrequencyValue) return;

    setIsLoading(true);
    try {
      const result = await updateDigestFrequency({
        userFrequency: digestFrequencyValue,
      });

      if (result?.serverError) {
        toastError({
          description: "Failed to save digest frequency. Please try again.",
        });
      } else {
        toastSuccess({ description: "Digest frequency saved!" });
        markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
        router.push(
          prefixPath(emailAccountId, "/assistant/onboarding/completed"),
        );
      }
    } catch (error) {
      toastError({
        description: "Failed to save digest frequency. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Set your digest frequency</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <p className="text-muted-foreground">
              Choose how often you want to receive your digest emails. These
              emails will include a summary of the actions taken on your behalf,
              based on your selected preferences.{" "}
              <button
                type="button"
                onClick={() => setShowExampleDialog(true)}
                className="text-primary underline hover:no-underline"
              >
                See example
              </button>
            </p>
            <FrequencyPicker onChange={setDigestFrequencyValue} />
            <Button
              className="w-full"
              onClick={handleFinish}
              disabled={isLoading || !digestFrequencyValue}
            >
              {isLoading ? "Saving..." : "Next"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showExampleDialog} onOpenChange={setShowExampleDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Digest Email Example</DialogTitle>
            <DialogDescription>
              This is an example of what your digest email will look like.
            </DialogDescription>
          </DialogHeader>
          <Image
            src="/images/assistant/digest.png"
            alt="Digest Email Example"
            width={800}
            height={1200}
            className="mx-auto"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
