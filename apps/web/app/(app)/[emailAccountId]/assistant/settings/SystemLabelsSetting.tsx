"use client";

import { useCallback, useState, useEffect } from "react";
import { SettingCard } from "@/components/SettingCard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/Select";
import { Label } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { LoadingContent } from "@/components/LoadingContent";
import { updateSystemLabelsAction } from "@/utils/actions/settings";
import { useLabels } from "@/hooks/useLabels";
import {
  AWAITING_REPLY_LABEL_NAME,
  NEEDS_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";
import { inboxZeroLabels } from "@/utils/label";

export function SystemLabelsSetting() {
  const {
    data: emailAccountData,
    isLoading: isLoadingAccount,
    error: accountError,
    mutate,
  } = useEmailAccountFull();
  const { userLabels, isLoading: isLoadingLabels } = useLabels();
  const [isSaving, setIsSaving] = useState(false);

  const [needsReplyLabelId, setNeedsReplyLabelId] = useState<string | null>(
    null,
  );
  const [awaitingReplyLabelId, setAwaitingReplyLabelId] = useState<
    string | null
  >(null);
  const [coldEmailLabelId, setColdEmailLabelId] = useState<string | null>(null);
  // const [doneLabelId, setDoneLabelId] = useState<string | null>(null);

  useEffect(() => {
    if (emailAccountData) {
      setNeedsReplyLabelId(emailAccountData.needsReplyLabelId ?? null);
      setAwaitingReplyLabelId(emailAccountData.awaitingReplyLabelId ?? null);
      setColdEmailLabelId(emailAccountData.coldEmailLabelId ?? null);
      // setDoneLabelId(emailAccountData.doneLabelId ?? null);
    }
  }, [emailAccountData]);

  const labelOptions =
    userLabels?.map((label: { id: string; name: string }) => ({
      label: label.name,
      value: label.id,
    })) ?? [];

  const handleSave = useCallback(async () => {
    if (!emailAccountData?.id) return;

    setIsSaving(true);
    try {
      const result = await updateSystemLabelsAction(emailAccountData.id, {
        needsReplyLabelId: needsReplyLabelId ?? undefined,
        awaitingReplyLabelId: awaitingReplyLabelId ?? undefined,
        coldEmailLabelId: coldEmailLabelId ?? undefined,
        // doneLabelId: doneLabelId ?? undefined,
      });

      if (result?.serverError) {
        toastError({ description: result.serverError });
        return;
      }

      toastSuccess({ description: "System labels updated" });
      await mutate();
    } finally {
      setIsSaving(false);
    }
  }, [
    emailAccountData?.id,
    needsReplyLabelId,
    awaitingReplyLabelId,
    coldEmailLabelId,
    // doneLabelId,
    mutate,
  ]);

  const hasChanges =
    needsReplyLabelId !== (emailAccountData?.needsReplyLabelId ?? null) ||
    awaitingReplyLabelId !== (emailAccountData?.awaitingReplyLabelId ?? null) ||
    coldEmailLabelId !== (emailAccountData?.coldEmailLabelId ?? null);
  // ||
  // doneLabelId !== (emailAccountData?.doneLabelId ?? null);

  return (
    <SettingCard
      title="System Labels"
      description="Configure which labels the AI assistant uses for state management (To Reply, Awaiting Reply, Done) and automation (Cold Email). You can rename these labels freely - the system will continue to work."
      right={
        <LoadingContent
          loading={isLoadingAccount || isLoadingLabels}
          error={accountError}
        >
          <div className="space-y-4 w-full max-w-md">
            <div>
              <Label name="needsReplyLabel" label="Needs Reply Label" />
              <Select
                name="needsReplyLabel"
                value={
                  needsReplyLabelId ??
                  labelOptions.find(
                    (l: { label: string; value: string }) =>
                      l.label === NEEDS_REPLY_LABEL_NAME,
                  )?.value ??
                  ""
                }
                options={labelOptions}
                onChange={(e) => setNeedsReplyLabelId(e.target.value)}
              />
            </div>

            <div>
              <Label name="awaitingReplyLabel" label="Awaiting Reply Label" />
              <Select
                name="awaitingReplyLabel"
                value={
                  awaitingReplyLabelId ??
                  labelOptions.find(
                    (l: { label: string; value: string }) =>
                      l.label === AWAITING_REPLY_LABEL_NAME,
                  )?.value ??
                  ""
                }
                options={labelOptions}
                onChange={(e) => setAwaitingReplyLabelId(e.target.value)}
              />
            </div>

            <div>
              <Label name="coldEmailLabel" label="Cold Email Label" />
              <Select
                name="coldEmailLabel"
                value={
                  coldEmailLabelId ??
                  labelOptions.find(
                    (l: { label: string; value: string }) =>
                      l.label === inboxZeroLabels.cold_email.name,
                  )?.value ??
                  ""
                }
                options={labelOptions}
                onChange={(e) => setColdEmailLabelId(e.target.value)}
              />
            </div>

            {/* <div>
              <Label name="doneLabel" label="Done Label" />
              <Select
                name="doneLabel"
                value={
                  doneLabelId ??
                  labelOptions.find((l: { label: string; value: string }) => l.label === "9. Done")?.value ??
                  ""
                }
                options={labelOptions}
                onChange={(e) => setDoneLabelId(e.target.value)}
              />
            </div> */}

            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              loading={isSaving}
            >
              Save Changes
            </Button>
          </div>
        </LoadingContent>
      }
    />
  );
}
