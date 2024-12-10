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
import { reportAiMistakeAction } from "@/utils/actions/ai-rule";
import type { MessagesResponse } from "@/app/api/google/messages/route";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  reportAiMistakeBody,
  type ReportAiMistakeBody,
} from "@/utils/actions/validation";

export function ReportMistake({
  message,
  result,
}: {
  message: MessagesResponse["messages"][number];
  result: TestResult | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ReportAiMistakeBody>({
    resolver: zodResolver(reportAiMistakeBody),
    defaultValues: {
      ruleId: result?.rule?.id,
      email: {
        from: message.headers.from,
        subject: message.headers.subject,
        snippet: message.snippet,
        textHtml: message.textHtml || null,
        textPlain: message.textPlain || null,
      },
    },
  });

  // if (Object.keys(errors).length > 0) {
  //   console.error("Errors:", errors);
  // }

  const reportMistake: SubmitHandler<ReportAiMistakeBody> = useCallback(
    async (data) => {
      // if (!result) return;

      if (!data?.ruleId) {
        alert(
          "No rule found. Can't report mistake. Will be implemented in the future.",
        );
        return;
      }

      const response = await reportAiMistakeAction(data);

      if (isActionError(response)) {
        toastError({
          title: "Error reporting mistake",
          description: response.error,
        });
      } else {
        toastSuccess({
          description: `This is the updated rule: ${response.fixedInstructions}`,
        });
        reset();
      }
    },
    [reset],
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-slate-900">
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
            placeholder="Optional: What was incorrect about this response?"
            registerProps={register("explanation")}
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
