"use client";

import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { isActionError } from "@/utils/error";
import type { TestResult } from "@/utils/ai/choose-rule/run-rules";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
// import { reportAiMistakeAction } from "@/utils/actions/ai-rule";

type ReportMistakeInputs = {
  ruleId: string;
  content: string;
  explanation: string;
};

const reportAiMistakeAction = async (options: ReportMistakeInputs) => {
  return { success: true };
};

export function ReportMistake({ result }: { result: TestResult | null }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ReportMistakeInputs>();

  const reportMistake: SubmitHandler<ReportMistakeInputs> = useCallback(
    async (data) => {
      if (!result) return;

      const response = await reportAiMistakeAction({
        ruleId: result.rule!.id,
        content: result.reason || "",
        explanation: data.explanation,
      });

      if (isActionError(response)) {
        toastError({
          title: "Error reporting mistake",
          description: response.error,
        });
      } else {
        toastSuccess({
          description: "Thank you for reporting this mistake",
        });
        reset();
      }
    },
    [result, reset],
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Mark as Error
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report Mistake</DialogTitle>
          <DialogDescription>
            Explain what went wrong and our AI will suggest a fix.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(reportMistake)} className="space-y-4">
          <Input
            type="text"
            autosizeTextarea
            rows={3}
            name="explanation"
            label="Explanation"
            placeholder="What was incorrect about this response?"
            registerProps={register("explanation", { required: true })}
            error={errors.explanation}
          />
          <Button type="submit" loading={isSubmitting}>
            Submit
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
