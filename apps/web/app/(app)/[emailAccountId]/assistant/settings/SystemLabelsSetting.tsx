"use client";

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SettingCard } from "@/components/SettingCard";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { LoadingContent } from "@/components/LoadingContent";
import { updateSystemLabelsAction } from "@/utils/actions/settings";
import {
  updateSystemLabelsBody,
  type UpdateSystemLabelsBody,
} from "@/utils/actions/settings.validation";
import { useLabels } from "@/hooks/useLabels";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/Input";
import { LabelCombobox } from "@/components/LabelCombobox";
import { SettingsIcon } from "lucide-react";
import {
  NEEDS_REPLY_LABEL_NAME,
  AWAITING_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";
import { inboxZeroLabels } from "@/utils/label";

export function SystemLabelsSetting() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <SettingCard
      title="System Labels"
      description="Configure which labels the AI assistant uses for reply tracking and cold emails."
      right={
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <SettingsIcon className="mr-2 h-4 w-4" />
              Configure System Labels
            </Button>
          </DialogTrigger>
          {isOpen && (
            <SystemLabelsDialogContent onClose={() => setIsOpen(false)} />
          )}
        </Dialog>
      }
    />
  );
}

function SystemLabelsDialogContent({ onClose }: { onClose: () => void }) {
  const {
    data: emailAccountData,
    isLoading: isLoadingAccount,
    error: accountError,
    mutate,
  } = useEmailAccountFull();
  const {
    userLabels,
    isLoading: isLoadingLabels,
    mutate: mutateLabels,
  } = useLabels();

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Configure System Labels</DialogTitle>
      </DialogHeader>
      <LoadingContent
        loading={isLoadingAccount || isLoadingLabels}
        error={accountError}
      >
        {emailAccountData && userLabels && (
          <SystemLabelsForm
            emailAccountData={emailAccountData}
            userLabels={userLabels}
            isLoadingLabels={isLoadingLabels}
            mutate={mutate}
            mutateLabels={mutateLabels}
            onClose={onClose}
          />
        )}
      </LoadingContent>
    </DialogContent>
  );
}

function SystemLabelsForm({
  emailAccountData,
  userLabels,
  isLoadingLabels,
  mutate,
  mutateLabels,
  onClose,
}: {
  emailAccountData: NonNullable<ReturnType<typeof useEmailAccountFull>["data"]>;
  userLabels: NonNullable<ReturnType<typeof useLabels>["userLabels"]>;
  isLoadingLabels: boolean;
  mutate: () => Promise<unknown>;
  mutateLabels: () => Promise<unknown>;
  onClose: () => void;
}) {
  // Find default labels by name if not already set
  const defaultValues = useMemo(() => {
    const defaultNeedsReplyLabel = userLabels.find(
      (l) => l.name === NEEDS_REPLY_LABEL_NAME,
    );
    const defaultAwaitingReplyLabel = userLabels.find(
      (l) => l.name === AWAITING_REPLY_LABEL_NAME,
    );
    const defaultColdEmailLabel = userLabels.find(
      (l) => l.name === inboxZeroLabels.cold_email.name,
    );

    return {
      needsReplyLabelId:
        emailAccountData.needsReplyLabelId ?? defaultNeedsReplyLabel?.id,
      awaitingReplyLabelId:
        emailAccountData.awaitingReplyLabelId ?? defaultAwaitingReplyLabel?.id,
      coldEmailLabelId:
        emailAccountData.coldEmailLabelId ?? defaultColdEmailLabel?.id,
    };
  }, [emailAccountData, userLabels]);

  const {
    watch,
    setValue,
    handleSubmit,
    formState: { isSubmitting, isDirty },
  } = useForm<UpdateSystemLabelsBody>({
    resolver: zodResolver(updateSystemLabelsBody),
    defaultValues,
  });

  const onSubmit = async (data: UpdateSystemLabelsBody) => {
    if (!emailAccountData?.id) return;

    const result = await updateSystemLabelsAction(emailAccountData.id, data);

    if (result?.serverError) {
      toastError({ description: result.serverError });
      return;
    }

    toastSuccess({ description: "System labels updated" });
    await mutate();
    onClose();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
      <div>
        <Label name="needsReplyLabelId" label="Needs Reply Label" />
        <div className="mt-1">
          <LabelCombobox
            value={{
              id: watch("needsReplyLabelId") || null,
              name: NEEDS_REPLY_LABEL_NAME,
            }}
            onChangeValue={(value) =>
              setValue("needsReplyLabelId", value || undefined, {
                shouldDirty: true,
              })
            }
            userLabels={userLabels ?? []}
            isLoading={isLoadingLabels}
            mutate={mutateLabels}
            emailAccountId={emailAccountData?.id ?? ""}
          />
        </div>
      </div>

      <div>
        <Label name="awaitingReplyLabelId" label="Awaiting Reply Label" />
        <div className="mt-1">
          <LabelCombobox
            value={{
              id: watch("awaitingReplyLabelId") || null,
              name: AWAITING_REPLY_LABEL_NAME,
            }}
            onChangeValue={(value) =>
              setValue("awaitingReplyLabelId", value || undefined, {
                shouldDirty: true,
              })
            }
            userLabels={userLabels ?? []}
            isLoading={isLoadingLabels}
            mutate={mutateLabels}
            emailAccountId={emailAccountData?.id ?? ""}
          />
        </div>
      </div>

      <div>
        <Label name="coldEmailLabelId" label="Cold Email Label" />
        <div className="mt-1">
          <LabelCombobox
            value={{
              id: watch("coldEmailLabelId") || null,
              name: inboxZeroLabels.cold_email.name,
            }}
            onChangeValue={(value) =>
              setValue("coldEmailLabelId", value || undefined, {
                shouldDirty: true,
              })
            }
            userLabels={userLabels ?? []}
            isLoading={isLoadingLabels}
            mutate={mutateLabels}
            emailAccountId={emailAccountData?.id ?? ""}
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={!isDirty || isSubmitting}
        loading={isSubmitting}
        className="w-full"
      >
        Save Changes
      </Button>
    </form>
  );
}
