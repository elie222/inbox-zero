"use client";

import { useCallback } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
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
import { LoadingContent } from "@/components/LoadingContent";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";

export function FilingRulesForm({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <FilingRulesFormContent
          emailAccountId={emailAccountId}
          initialPrompt={data.filingPrompt || ""}
          mutateEmail={mutate}
        />
      )}
    </LoadingContent>
  );
}

function FilingRulesFormContent({
  emailAccountId,
  initialPrompt,
  mutateEmail,
}: {
  emailAccountId: string;
  initialPrompt: string;
  mutateEmail: () => void;
}) {
  const { t } = useLingui();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateFilingPromptBody>({
    resolver: zodResolver(updateFilingPromptBody),
    defaultValues: {
      filingPrompt: initialPrompt,
    },
  });

  const onSubmit: SubmitHandler<UpdateFilingPromptBody> = useCallback(
    async (data) => {
      const result = await updateFilingPromptAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: t`Error saving rules`,
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: t`Filing rules saved` });
        mutateEmail();
      }
    },
    [emailAccountId, mutateEmail, t],
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <Trans>Filing rules</Trans>
        </CardTitle>
        <CardDescription>
          <Trans>How should we organize your files?</Trans>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Input
            type="textarea"
            name="filingPrompt"
            placeholder={t`Receipts go to Expenses, in a subfolder per year and month. Contracts go to Legal, one subfolder per counterparty.`}
            registerProps={register("filingPrompt")}
            error={errors.filingPrompt}
            autosizeTextarea
            rows={3}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={isSubmitting}>
              <Trans>Save</Trans>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
