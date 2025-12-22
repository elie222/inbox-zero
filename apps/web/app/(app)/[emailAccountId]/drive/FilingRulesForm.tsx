"use client";

import { useCallback, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { updateFilingPromptAction } from "@/utils/actions/drive";
import {
  updateFilingPromptBody,
  type UpdateFilingPromptBody,
} from "@/utils/actions/drive.validation";

export function FilingRulesForm({
  emailAccountId,
  initialPrompt,
  mutateEmail,
}: {
  emailAccountId: string;
  initialPrompt: string;
  mutateEmail: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateFilingPromptBody>({
    resolver: zodResolver(updateFilingPromptBody),
    defaultValues: {
      filingPrompt: initialPrompt,
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit: SubmitHandler<UpdateFilingPromptBody> = useCallback(
    async (data) => {
      setIsSubmitting(true);

      const result = await updateFilingPromptAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: "Error saving rules",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Filing rules saved" });
        mutateEmail();
      }

      setIsSubmitting(false);
    },
    [emailAccountId, mutateEmail],
  );

  return (
    <Card size="sm">
      <CardHeader className="pb-3">
        <CardTitle>Filing rules</CardTitle>
        <CardDescription>How should we organize your files?</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Input
            type="textarea"
            name="filingPrompt"
            placeholder="Receipts go to Expenses by month. Contracts go to Legal."
            registerProps={register("filingPrompt")}
            error={errors.filingPrompt}
            autosizeTextarea
            rows={3}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
