"use client";

import { useCallback } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
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
import { Toggle } from "@/components/Toggle";
import { Separator } from "@/components/ui/separator";
import { toastSuccess, toastError } from "@/components/Toast";
import { updateFilingPromptAction } from "@/utils/actions/drive";
import {
  updateFilingPromptBody,
  type UpdateFilingPromptBody,
} from "@/utils/actions/drive.validation";
import { updateChannelFeaturesAction } from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";
import { LoadingContent } from "@/components/LoadingContent";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";

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
          title: "Error saving rules",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Filing rules saved" });
        mutateEmail();
      }
    },
    [emailAccountId, mutateEmail],
  );

  return (
    <Card size="sm">
      <CardHeader>
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
        <SlackFilingToggles emailAccountId={emailAccountId} />
      </CardContent>
    </Card>
  );
}

function SlackFilingToggles({ emailAccountId }: { emailAccountId: string }) {
  const { data, isLoading, mutate } = useMessagingChannels();

  const channels =
    data?.channels.filter((c) => c.isConnected && c.channelId) ?? [];

  if (isLoading || channels.length === 0) return null;

  return (
    <>
      <Separator className="my-3" />
      {channels.map((channel) => (
        <SlackFilingToggle
          key={channel.id}
          channelId={channel.id}
          channelName={channel.channelName}
          enabled={channel.sendDocumentFilings}
          emailAccountId={emailAccountId}
          onUpdate={mutate}
        />
      ))}
    </>
  );
}

function SlackFilingToggle({
  channelId,
  channelName,
  enabled,
  emailAccountId,
  onUpdate,
}: {
  channelId: string;
  channelName: string | null;
  enabled: boolean;
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const { execute } = useAction(
    updateChannelFeaturesAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved" });
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    },
  );

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">
        Notify via Slack
        {channelName && <span> &middot; #{channelName}</span>}
      </span>
      <Toggle
        name={`filing-${channelId}`}
        enabled={enabled}
        onChange={(sendDocumentFilings) =>
          execute({ channelId, sendDocumentFilings })
        }
      />
    </div>
  );
}
