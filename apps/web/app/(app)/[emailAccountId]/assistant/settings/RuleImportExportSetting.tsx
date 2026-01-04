"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { DownloadIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";
import { toastError } from "@/components/Toast";
import { useRules } from "@/hooks/useRules";
import { useAccount } from "@/providers/EmailAccountProvider";
import { importRulesAction } from "@/utils/actions/rule";

export function RuleImportExportSetting() {
  const { data, mutate } = useRules();
  const { emailAccountId } = useAccount();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportRules = useCallback(() => {
    if (!data) return;

    const exportData = data.map((rule) => ({
      name: rule.name,
      instructions: rule.instructions,
      enabled: rule.enabled,
      automate: rule.automate,
      runOnThreads: rule.runOnThreads,
      systemType: rule.systemType,
      conditionalOperator: rule.conditionalOperator,
      from: rule.from,
      to: rule.to,
      subject: rule.subject,
      body: rule.body,
      categoryFilterType: rule.categoryFilterType,
      actions: rule.actions.map((action) => ({
        type: action.type,
        label: action.label,
        to: action.to,
        cc: action.cc,
        bcc: action.bcc,
        subject: action.subject,
        content: action.content,
        folderName: action.folderName,
        url: action.url,
        delayInMinutes: action.delayInMinutes,
      })),
      // note: group associations are not exported as they require matching group IDs
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inbox-zero-rules-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Rules exported successfully");
  }, [data]);

  const importRules = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const rules = JSON.parse(text);

        const rulesArray = Array.isArray(rules) ? rules : rules.rules;

        if (!Array.isArray(rulesArray) || rulesArray.length === 0) {
          toastError({ description: "Invalid rules file format" });
          return;
        }

        const result = await importRulesAction(emailAccountId, {
          rules: rulesArray,
        });

        if (result?.serverError) {
          toastError({
            title: "Import failed",
            description: result.serverError,
          });
        } else if (result?.data) {
          const { createdCount, updatedCount, skippedCount } = result.data;
          toast.success(
            `Imported ${createdCount} new, updated ${updatedCount} existing${skippedCount > 0 ? `, skipped ${skippedCount}` : ""}`,
          );
          mutate();
        }
      } catch (error) {
        toastError({
          title: "Import failed",
          description:
            error instanceof Error ? error.message : "Failed to parse file",
        });
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [emailAccountId, mutate],
  );

  return (
    <SettingCard
      title="Import / Export Rules"
      description="Backup your rules to a JSON file or restore from a previous export."
      right={
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept=".json"
            onChange={importRules}
            className="hidden"
            aria-label="Import rules from JSON file"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="mr-2 size-4" />
            Import
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={exportRules}
            disabled={!data?.length}
          >
            <DownloadIcon className="mr-2 size-4" />
            Export
          </Button>
        </div>
      }
    />
  );
}
