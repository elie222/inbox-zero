"use client";

import { useState } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Tooltip } from "@/components/Tooltip";
import { toastError, toastSuccess } from "@/components/Toast";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  deleteLabelAction,
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
import { LABEL_ICONS } from "@/utils/label-icons";
import { prefixPath } from "@/utils/path";
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
  const [tab, setTab] = useState<"settings" | "rules">("settings");
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
            <SheetTitle className="flex items-center gap-2.5">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: dbLabel?.color ?? "currentColor" }}
              />
              {label.name}
            </SheetTitle>
            <SheetDescription>Settings for this folder</SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex gap-5 border-b border-border text-[13.5px] font-medium">
            {(["settings", "rules"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  "border-b-2 px-0.5 py-2.5 capitalize",
                  tab === value
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {value}
              </button>
            ))}
          </div>

          {tab === "settings" ? (
            <div className="mt-6 space-y-8">
              <IconSetting
                key={`icon-${labelId}`}
                emailAccountId={emailAccountId}
                labelId={labelId}
                labelName={label.name}
                dbLabel={dbLabel}
                mutateDbLabels={mutateDbLabels}
              />

              <ColorSetting
                key={`color-${labelId}`}
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

              <DeleteSetting
                labelId={labelId}
                labelName={label.name}
                mutateLabels={mutate}
                mutateDbLabels={mutateDbLabels}
              />
            </div>
          ) : (
            <div className="mt-6">
              <FolderRuleSetting
                key={`rule-${labelId}`}
                labelId={labelId}
                labelName={label.name}
                onEditRule={onEditRule}
              />
            </div>
          )}
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

// The swatches from the design; null means "no colour picked", which leaves
// the sidebar dot on its name-hashed default
const FOLDER_COLORS = [
  "hsl(210 65% 55%)",
  "hsl(150 65% 55%)",
  "hsl(330 65% 55%)",
  "hsl(45 65% 55%)",
  "hsl(270 65% 55%)",
  "hsl(0 65% 55%)",
];

function ColorSetting({
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
  const [selected, setSelected] = useState(dbLabel?.color ?? null);

  const { execute, isExecuting } = useAction(
    updateLabelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Folder color updated" });
        mutateDbLabels();
      },
      onError: (error) => {
        setSelected(dbLabel?.color ?? null);
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const save = (color: string | null) => {
    setSelected(color);
    // Same as the icon picker: only this field changes, everything else
    // reuses what's already saved
    execute({
      name: labelName,
      description: dbLabel?.description ?? undefined,
      enabled: dbLabel?.enabled ?? false,
      gmailLabelId: labelId,
      icon: dbLabel?.icon,
      color,
    });
  };

  return (
    <div>
      <Label>Color</Label>
      <p className="mt-1 text-sm text-muted-foreground">
        The dot next to this folder in the sidebar.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {FOLDER_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Use color ${color}`}
            aria-pressed={selected === color}
            disabled={isExecuting}
            onClick={() => save(color)}
            className={cn(
              "flex size-6 items-center justify-center rounded-full border-2",
              selected === color ? "border-primary" : "border-transparent",
            )}
          >
            <span
              className="size-3.5 rounded-full"
              style={{ backgroundColor: color }}
            />
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          disabled={isExecuting || !selected}
          onClick={() => save(null)}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

// Deleting removes the folder at the provider and the rule that filed into
// it. Emails keep their history, so this is recoverable enough to live in
// the drawer rather than behind a settings page.
function DeleteSetting({
  labelId,
  labelName,
  mutateLabels,
  mutateDbLabels,
}: {
  labelId: string;
  labelName: string;
  mutateLabels: () => void;
  mutateDbLabels: () => void;
}) {
  const router = useRouter();
  const { emailAccountId } = useAccount();

  const { executeAsync, isExecuting } = useAction(
    deleteLabelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: `Deleted “${labelName}”` });
        mutateLabels();
        mutateDbLabels();
        // The page is showing the folder that no longer exists
        router.push(prefixPath(emailAccountId, "/mail"));
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/50 p-3.5">
      <div>
        <Label>Delete folder</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          Emails keep their history; the filing rule is removed.
        </p>
      </div>
      <ConfirmDialog
        title={`Delete “${labelName}”?`}
        description="The folder is removed from your mailbox and any rule that only filed into it is deleted. Your emails are not deleted."
        onConfirm={async () => {
          await executeAsync({ labelId, name: labelName });
        }}
        trigger={
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/70 text-destructive hover:bg-destructive/10 hover:text-destructive"
            loading={isExecuting}
          >
            Delete
          </Button>
        }
      />
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
          otherRuleNames={data.otherRuleNames ?? []}
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
  otherRuleNames,
  mutateRule,
  onEditRule,
}: {
  labelId: string;
  labelName: string;
  rule: FolderRuleResponse["rule"];
  otherRuleNames: string[];
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
          {otherRuleNames.length > 0 && (
            <p className="mt-1 text-sm text-amber-600 dark:text-amber-500">
              Also filed into by: {otherRuleNames.join(", ")}. Turning this rule
              off won't stop {otherRuleNames.length === 1 ? "it" : "them"} —
              manage {otherRuleNames.length === 1 ? "it" : "them"} on the
              Assistant page.
            </p>
          )}
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
