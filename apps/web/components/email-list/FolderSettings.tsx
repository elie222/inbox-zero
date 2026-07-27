"use client";

import { useState } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { useAction } from "next-safe-action/hooks";
import { PencilIcon, PlusIcon, SettingsIcon, SparklesIcon } from "lucide-react";
import type { UserLabelsResponse } from "@/app/api/user/labels/route";
import type { FolderRuleResponse } from "@/app/api/user/rules/label/[labelId]/route";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { toastError, toastSuccess } from "@/components/Toast";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  updateLabelAction,
  updateLabelVisibilityAction,
} from "@/utils/actions/mail";
import { generateFolderInstructionsAction } from "@/utils/actions/folder-rule";
import {
  setRuleExcludeKnownContactsAction,
  toggleRuleAction,
} from "@/utils/actions/rule";
import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import { getActionErrorMessage } from "@/utils/error";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { LABEL_ICONS, getLabelIcon } from "@/utils/label-icons";
import { cn } from "@/utils";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { ConditionType } from "@/utils/config";

// The assistant's rule editor — loaded on demand so the mail page doesn't
// carry it until a rule is actually opened
const RuleDialog = dynamic(() =>
  import("@/app/(app)/[emailAccountId]/assistant/RuleDialog").then(
    (mod) => mod.RuleDialog,
  ),
);

// Header row for label folder views: folder name plus the settings gear.
// Rendered above the list so it's available even when the folder is empty.
export function FolderHeader({ labelId }: { labelId: string }) {
  const { userLabels } = useLabels();
  const { data: dbLabels } = useSWR<UserLabelsResponse>("/api/user/labels");
  const label = userLabels.find((userLabel) => userLabel.id === labelId);
  const Icon = getLabelIcon(
    dbLabels?.find((candidate) => candidate.gmailLabelId === labelId)?.icon,
  );

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <h1 className="truncate font-display text-2xl tracking-tight">
          {label?.name.split("/").pop() ?? "Folder"}
        </h1>
      </div>
      <FolderSettings labelId={labelId} />
    </div>
  );
}

type RuleEditorConfig = {
  ruleId?: string;
  initialRule?: Partial<CreateRuleBody>;
};

export function FolderSettings({ labelId }: { labelId: string }) {
  const [open, setOpen] = useState(false);
  // The rule editor must live outside the Sheet: opening a dialog from
  // inside would unmount with the sheet and never show
  const [ruleEditor, setRuleEditor] = useState<RuleEditorConfig | null>(null);

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <Tooltip content="Folder settings">
          <SheetTrigger asChild>
            <Button variant="ghost" size="iconSm">
              <span className="sr-only">Folder settings</span>
              <SettingsIcon className="size-4" />
            </Button>
          </SheetTrigger>
        </Tooltip>
        <SheetContent side="right" className="overflow-y-auto">
          {open && (
            <FolderSettingsContent
              labelId={labelId}
              onEditRule={(config) => {
                setOpen(false);
                setRuleEditor(config);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {ruleEditor && (
        <RuleDialog
          ruleId={ruleEditor.ruleId}
          initialRule={ruleEditor.initialRule}
          isOpen
          onClose={() => setRuleEditor(null)}
          onSuccess={() => setRuleEditor(null)}
          editMode
        />
      )}
    </>
  );
}

function FolderSettingsContent({
  labelId,
  onEditRule,
}: {
  labelId: string;
  onEditRule: (config: RuleEditorConfig) => void;
}) {
  const { emailAccountId, provider } = useAccount();
  const { userLabels, isLoading, error, mutate } = useLabels();
  const {
    data: dbLabels,
    isLoading: isLoadingDbLabels,
    error: dbLabelsError,
    mutate: mutateDbLabels,
  } = useSWR<UserLabelsResponse>("/api/user/labels");

  const label = userLabels.find((userLabel) => userLabel.id === labelId);
  const dbLabel = dbLabels?.find(
    (candidate) => candidate.gmailLabelId === labelId,
  );

  return (
    <LoadingContent
      loading={isLoading || isLoadingDbLabels}
      error={error || dbLabelsError}
    >
      {label ? (
        <>
          <SheetHeader>
            <SheetTitle>{label.name}</SheetTitle>
            <SheetDescription>Settings for this folder</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-8">
            <IconSetting
              key={`icon-${labelId}`}
              emailAccountId={emailAccountId}
              labelId={labelId}
              labelName={label.name}
              dbLabel={dbLabel}
              mutateDbLabels={mutateDbLabels}
            />

            {isGoogleProvider(provider) && (
              <VisibilitySetting
                labelId={labelId}
                visible={label.labelListVisibility !== "labelHide"}
                mutateLabels={mutate}
              />
            )}

            <FolderRuleSetting
              key={`rule-${labelId}`}
              labelId={labelId}
              labelName={label.name}
              onEditRule={onEditRule}
            />
          </div>
        </>
      ) : (
        <SheetHeader>
          <SheetTitle>Folder not found</SheetTitle>
        </SheetHeader>
      )}
    </LoadingContent>
  );
}

function IconSetting({
  emailAccountId,
  labelId,
  labelName,
  dbLabel,
  mutateDbLabels,
}: {
  emailAccountId: string;
  labelId: string;
  labelName: string;
  dbLabel: UserLabelsResponse[number] | undefined;
  mutateDbLabels: () => void;
}) {
  const [selected, setSelected] = useState(dbLabel?.icon ?? "tag");

  const { execute, isExecuting } = useAction(
    updateLabelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Folder icon updated" });
        mutateDbLabels();
      },
      onError: (error) => {
        setSelected(dbLabel?.icon ?? "tag");
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <div>
      <Label>Icon</Label>
      <p className="mt-1 text-sm text-muted-foreground">
        Shown next to this folder in the sidebar — handy when the sidebar is
        collapsed.
      </p>
      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {Object.entries(LABEL_ICONS).map(([name, Icon]) => (
          <button
            key={name}
            type="button"
            aria-label={`Use ${name} icon`}
            aria-pressed={selected === name}
            disabled={isExecuting}
            onClick={() => {
              setSelected(name);
              // Icon applies immediately; description/enabled reuse the
              // saved values so an unsaved AI draft isn't committed here
              execute({
                name: labelName,
                description: dbLabel?.description ?? undefined,
                enabled: dbLabel?.enabled ?? false,
                gmailLabelId: labelId,
                icon: name,
              });
            }}
            className={cn(
              "flex items-center justify-center rounded-md border border-border p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              selected === name && "border-primary bg-primary/10 text-primary",
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

function VisibilitySetting({
  labelId,
  visible,
  mutateLabels,
}: {
  labelId: string;
  visible: boolean;
  mutateLabels: () => void;
}) {
  const { emailAccountId } = useAccount();

  const { execute, isExecuting } = useAction(
    updateLabelVisibilityAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Folder visibility updated" });
        mutateLabels();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor="folder-visible">Show in sidebar</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          Hidden folders stay usable but move under the sidebar's "More" toggle.
        </p>
      </div>
      <Switch
        id="folder-visible"
        checked={visible}
        disabled={isExecuting}
        onCheckedChange={(checked) => execute({ labelId, visible: checked })}
      />
    </div>
  );
}

// The rule that files emails into this folder — the same rules engine as the
// Assistant page, scoped to this folder's LABEL action.
function FolderRuleSetting({
  labelId,
  labelName,
  onEditRule,
}: {
  labelId: string;
  labelName: string;
  onEditRule: (config: RuleEditorConfig) => void;
}) {
  const { data, isLoading, error, mutate } = useSWR<FolderRuleResponse>(
    `/api/user/rules/label/${encodeURIComponent(labelId)}?name=${encodeURIComponent(labelName)}`,
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <FolderRuleForm
          key={data.rule?.id ?? "new"}
          labelId={labelId}
          labelName={labelName}
          rule={data.rule}
          mutateRule={mutate}
          onEditRule={onEditRule}
        />
      )}
    </LoadingContent>
  );
}

// Status + entry points only: all editing happens in the assistant's
// RuleDialog so the drawer and the Assistant page are one and the same editor
function FolderRuleForm({
  labelId,
  labelName,
  rule,
  mutateRule,
  onEditRule,
}: {
  labelId: string;
  labelName: string;
  rule: FolderRuleResponse["rule"];
  mutateRule: () => void;
  onEditRule: (config: RuleEditorConfig) => void;
}) {
  const { emailAccountId } = useAccount();

  const isOrgManaged = !!rule?.organizationRuleId;

  const toggle = useAction(toggleRuleAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Automatic filing updated" });
      mutateRule();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
      mutateRule();
    },
  });

  const excludeContacts = useAction(
    setRuleExcludeKnownContactsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Known contact handling updated" });
        mutateRule();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
        mutateRule();
      },
    },
  );

  const generate = useAction(
    generateFolderInstructionsAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        if (!result.data) return;
        onEditRule({
          initialRule: buildInitialFolderRule({
            labelId,
            labelName,
            instructions: result.data.instructions,
            senders: result.data.senderPatterns,
          }),
        });
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="folder-rule-enabled">Automatic filing</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            {rule ? (
              <>
                Managed as the “{rule.name}” rule — the same rule you see on the
                Assistant page.
              </>
            ) : (
              <>
                No filing rule exists for this folder yet. Create one here or
                let the AI draft it from the folder's emails.
              </>
            )}
          </p>
        </div>
        {rule && (
          <Switch
            id="folder-rule-enabled"
            checked={rule.enabled}
            disabled={isOrgManaged || toggle.isExecuting}
            onCheckedChange={(checked) =>
              toggle.execute({ ruleId: rule.id, enabled: checked })
            }
          />
        )}
      </div>

      {rule && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="folder-rule-known-contacts">
              Skip known contacts
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              {rule.systemType === "COLD_EMAIL"
                ? "People in your contacts are never marked as cold email."
                : "People in your contacts are never filed here by this rule."}
            </p>
          </div>
          <Switch
            id="folder-rule-known-contacts"
            checked={rule.excludeKnownContacts}
            disabled={isOrgManaged || excludeContacts.isExecuting}
            onCheckedChange={(checked) =>
              excludeContacts.execute({
                ruleId: rule.id,
                excludeKnownContacts: checked,
              })
            }
          />
        </div>
      )}

      {isOrgManaged ? (
        <p className="text-sm text-muted-foreground">
          This folder is filed by an organization-managed rule. Edit it from the
          Assistant page.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onEditRule(
                rule
                  ? { ruleId: rule.id }
                  : {
                      initialRule: buildInitialFolderRule({
                        labelId,
                        labelName,
                      }),
                    },
              )
            }
          >
            {rule ? (
              <>
                <PencilIcon className="mr-1.5 size-3.5" />
                Edit rule
              </>
            ) : (
              <>
                <PlusIcon className="mr-1.5 size-3.5" />
                Create rule
              </>
            )}
          </Button>
          {!rule && (
            <Button
              variant="outline"
              size="sm"
              loading={generate.isExecuting}
              onClick={() => generate.execute({ labelId, labelName })}
            >
              <SparklesIcon className="mr-1.5 size-3.5" />
              Generate from folder
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function buildInitialFolderRule({
  labelId,
  labelName,
  instructions,
  senders,
}: {
  labelId: string;
  labelName: string;
  instructions?: string;
  senders?: string[];
}): Partial<CreateRuleBody> {
  const conditions: CreateRuleBody["conditions"] = [];
  if (instructions) {
    conditions.push({ type: ConditionType.AI, instructions });
  }
  if (senders?.length) {
    conditions.push({ type: ConditionType.STATIC, from: senders.join(", ") });
  }
  if (!conditions.length) {
    conditions.push({ type: ConditionType.AI });
  }

  return {
    name: `Label: ${labelName}`,
    conditions,
    conditionalOperator:
      conditions.length > 1 ? LogicalOperator.OR : LogicalOperator.AND,
    actions: [
      {
        type: ActionType.LABEL,
        labelId: { value: labelId, name: labelName },
      },
    ],
    runOnThreads: false,
  };
}
