"use client";

import { useState } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  ChevronDownIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import type { UserLabelsResponse } from "@/app/api/user/labels/route";
import type { FolderRuleResponse } from "@/app/api/user/rules/label/[labelId]/route";
import type { RuleResponse } from "@/app/api/user/rules/[id]/route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  generateFolderInstructionsAction,
  setFolderAutoReadAction,
} from "@/utils/actions/folder-rule";
import type { FolderAutoReadMode } from "@/utils/actions/folder-rule.validation";
import {
  setRuleExcludeKnownContactsAction,
  toggleRuleAction,
  updateRuleAction,
} from "@/utils/actions/rule";
import type {
  CreateRuleBody,
  UpdateRuleBody,
} from "@/utils/actions/rule.validation";
import { ACTION_TYPE_LABELS, getActionDisplay } from "@/utils/action-display";
import { staticConditionsToString } from "@/utils/condition";
import { getActionErrorMessage } from "@/utils/error";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { LABEL_ICONS, getLabelIcon } from "@/utils/label-icons";
import { prefixPath } from "@/utils/path";
import { cn } from "@/utils";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { ConditionType } from "@/utils/config";
import { useSWRWithEmailAccount } from "@/utils/swr";

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

// The gear for the folder currently being viewed, in the mail control bar.
// The sidebar has a gear on every label row and drives the drawer directly.
export function FolderSettings({ labelId }: { labelId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip content="Folder settings">
        <Button variant="ghost" size="iconSm" onClick={() => setOpen(true)}>
          <span className="sr-only">Folder settings</span>
          <SettingsIcon className="size-4" />
        </Button>
      </Tooltip>
      <FolderSettingsDrawer
        labelId={open ? labelId : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// Controlled by which folder is being edited, so one instance can serve every
// gear in the sidebar.
export function FolderSettingsDrawer({
  labelId,
  onClose,
}: {
  labelId: string | null;
  onClose: () => void;
}) {
  // The rule editor must live outside the Sheet: opening a dialog from
  // inside would unmount with the sheet and never show
  const [ruleEditor, setRuleEditor] = useState<RuleEditorConfig | null>(null);

  return (
    <>
      <Sheet open={!!labelId} onOpenChange={(open) => !open && onClose()}>
        {/* The drawer's own header and tab strip stay put while the body
            scrolls, so it owns its padding rather than the sheet */}
        <SheetContent
          side="right"
          className="flex w-full max-w-none flex-col gap-0 p-0 sm:max-w-[480px] [&>button]:top-[calc(1rem+env(safe-area-inset-top,0px))]"
        >
          {labelId && (
            <FolderSettingsContent
              key={labelId}
              labelId={labelId}
              onEditRule={(config) => {
                onClose();
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
  } = useSWRWithEmailAccount<UserLabelsResponse>("/api/user/labels");

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
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="flex shrink-0 flex-row items-center gap-3 border-b border-border px-6 pb-3.5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pr-12 space-y-0">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: dbLabel?.color ?? "currentColor" }}
            />
            <div className="min-w-0 flex-1 text-left">
              <SheetTitle className="truncate font-display text-[23px] font-normal tracking-tight">
                {label.name}
              </SheetTitle>
              <SheetDescription className="mt-0.5">
                Settings for this folder
              </SheetDescription>
            </div>
          </SheetHeader>

          <div className="flex shrink-0 gap-5 border-b border-border px-6 text-[13.5px] font-medium">
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

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-4">
            {tab === "settings" ? (
              <div className="divide-y divide-border">
                <div className="pb-4">
                  <IconSetting
                    emailAccountId={emailAccountId}
                    labelId={labelId}
                    labelName={label.name}
                    dbLabel={dbLabel}
                    mutateDbLabels={mutateDbLabels}
                  />
                </div>

                <div className="py-4">
                  <ColorSetting
                    emailAccountId={emailAccountId}
                    labelId={labelId}
                    labelName={label.name}
                    dbLabel={dbLabel}
                    mutateDbLabels={mutateDbLabels}
                  />
                </div>

                {isGoogleProvider(provider) && (
                  <div className="py-4">
                    <VisibilitySetting
                      labelId={labelId}
                      visible={label.labelListVisibility !== "labelHide"}
                      mutateLabels={mutate}
                    />
                  </div>
                )}

                <div className="pt-4">
                  <DeleteSetting
                    labelId={labelId}
                    labelName={label.name}
                    mutateLabels={mutate}
                    mutateDbLabels={mutateDbLabels}
                  />
                </div>
              </div>
            ) : (
              <FolderRuleSetting
                labelId={labelId}
                labelName={label.name}
                onEditRule={onEditRule}
              />
            )}
          </div>
        </div>
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
  // The grid is a dozen buttons for a setting most folders never change, so
  // it stays behind the current icon until asked for
  const [picking, setPicking] = useState(false);

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

  const SelectedIcon = getLabelIcon(selected);

  return (
    <div>
      <Label>Icon</Label>
      <p className="mt-1 text-sm text-muted-foreground">
        Shown next to this folder in the sidebar.
      </p>

      {picking ? (
        <div className="mt-2 grid grid-cols-6 gap-1.5">
          {Object.entries(LABEL_ICONS).map(([name, Icon]) => (
            <button
              key={name}
              type="button"
              aria-label={`Use ${name} icon`}
              aria-pressed={selected === name}
              disabled={isExecuting}
              onClick={() => {
                setSelected(name);
                setPicking(false);
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
                "flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                selected === name &&
                  "border-primary bg-primary/10 text-primary",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="mt-2 flex h-11 items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted/60"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <SelectedIcon className="size-4" />
          </span>
          Change icon
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </button>
      )}
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
              className="size-[13px] rounded-full"
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
    <div className="flex items-center justify-between gap-4 rounded-[10px] border border-destructive/50 p-3.5">
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
          autoRead={data.autoRead}
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
  autoRead,
  otherRuleNames,
  mutateRule,
  onEditRule,
}: {
  labelId: string;
  labelName: string;
  rule: FolderRuleResponse["rule"];
  autoRead: FolderRuleResponse["autoRead"];
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
    <div className="space-y-5">
      {rule ? (
        <div className="rounded-[10px] border border-border bg-card p-3.5">
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {rule.name}
            </span>
            <Badge variant={rule.enabled ? "green" : "secondary"}>
              {rule.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            The same rule you see on the Assistant page — edits here apply
            everywhere.
          </p>
          {otherRuleNames.length > 0 && (
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
              Also filed into by: {otherRuleNames.join(", ")}. Turning this rule
              off won't stop {otherRuleNames.length === 1 ? "it" : "them"} —
              manage {otherRuleNames.length === 1 ? "it" : "them"} on the
              Assistant page.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No filing rule exists for this folder yet. Create one here or let the
          AI draft it from the folder's emails.
        </p>
      )}

      {rule && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="folder-rule-enabled">Automatic filing</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              File matching mail into this folder automatically.
            </p>
          </div>
          <Switch
            id="folder-rule-enabled"
            checked={rule.enabled}
            disabled={isOrgManaged || toggle.isExecuting}
            onCheckedChange={(checked) =>
              toggle.execute({ ruleId: rule.id, enabled: checked })
            }
          />
        </div>
      )}

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

      {!isOrgManaged && (
        <AutoReadSetting
          labelId={labelId}
          labelName={labelName}
          autoRead={autoRead}
          hasRule={!!rule}
          mutateRule={mutateRule}
        />
      )}

      {rule && !isOrgManaged && (
        <RuleComposition ruleId={rule.id} onEditRule={onEditRule} />
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

const AUTO_READ_OPTIONS: {
  mode: FolderAutoReadMode;
  label: string;
  description: string;
}[] = [
  { mode: "off", label: "Off", description: "Mail arrives unread." },
  {
    mode: "all",
    label: "Everything filed here",
    description: "Anything this folder's rule files is marked read.",
  },
  {
    mode: "only",
    label: "Only these senders",
    description: "Everything else in this folder stays unread.",
  },
  {
    mode: "except",
    label: "Everything except these senders",
    description: "The listed senders keep arriving unread.",
  },
];

// Mail filed here can be marked read on the way in. The scoped modes are
// backed by their own rule, so the folder's filing rule keeps matching as
// broadly as it did.
function AutoReadSetting({
  labelId,
  labelName,
  autoRead,
  hasRule,
  mutateRule,
}: {
  labelId: string;
  labelName: string;
  autoRead: FolderRuleResponse["autoRead"];
  hasRule: boolean;
  mutateRule: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [mode, setMode] = useState<FolderAutoReadMode>(autoRead.mode);
  const [senders, setSenders] = useState(autoRead.senders);

  const { execute, isExecuting } = useAction(
    setFolderAutoReadAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Auto mark-as-read updated" });
        mutateRule();
      },
      onError: (error) => {
        setMode(autoRead.mode);
        setSenders(autoRead.senders);
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const needsSenders = mode === "only" || mode === "except";
  const save = (next: FolderAutoReadMode, nextSenders: string) =>
    execute({ labelId, labelName, mode: next, senders: nextSenders });

  return (
    <div>
      <Label>Mark as read</Label>
      <p className="mt-1 text-sm text-muted-foreground">
        Skip the unread badge for mail you don't need to open.
      </p>

      <div className="mt-3 space-y-2">
        {AUTO_READ_OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            // "Everything filed here" hangs off the folder's filing rule,
            // so it needs one to exist; the scoped modes bring their own
            disabled={isExecuting || (option.mode === "all" && !hasRule)}
            onClick={() => {
              setMode(option.mode);
              // Scoped modes wait for the sender list before saving
              if (option.mode === "only" || option.mode === "except") {
                if (senders.trim()) save(option.mode, senders);
                return;
              }
              save(option.mode, "");
            }}
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-left disabled:opacity-50",
              mode === option.mode
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
            )}
          >
            <span className="text-sm font-medium">{option.label}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              {option.mode === "all" && !hasRule
                ? "Needs a filing rule for this folder first."
                : option.description}
            </span>
          </button>
        ))}
      </div>

      {needsSenders && (
        <div className="mt-3">
          <Textarea
            rows={2}
            placeholder="noreply@acme.com, @newsletters.example.com"
            value={senders}
            onChange={(event) => setSenders(event.target.value)}
            onBlur={() => {
              if (senders.trim() && senders !== autoRead.senders) {
                save(mode, senders);
              }
            }}
          />
          <p className="mt-1 text-sm text-muted-foreground">
            One address or domain per entry, comma separated. A domain matches
            everyone there.
          </p>
        </div>
      )}
    </div>
  );
}

// What the rule actually matches on and does, as drawn in the design: the
// conditions with their match mode, then the actions. Removing an entry and
// switching any/all save straight away; composing anything new opens the
// assistant's rule editor, which owns every field's editing rules.
function RuleComposition({
  ruleId,
  onEditRule,
}: {
  ruleId: string;
  onEditRule: (config: RuleEditorConfig) => void;
}) {
  const { emailAccountId, provider } = useAccount();
  const { userLabels } = useLabels();
  const { data, isLoading, error, mutate } = useSWR<RuleResponse>(
    `/api/user/rules/${ruleId}`,
  );

  const { execute, isExecuting } = useAction(
    updateRuleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Rule updated" });
        mutate();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
        mutate();
      },
    },
  );

  // Every save posts the whole rule, so each edit starts from what's stored
  const save = (changes: Partial<UpdateRuleBody>) => {
    if (!data) return;
    execute({
      id: ruleId,
      name: data.rule.name,
      runOnThreads: data.rule.runOnThreads,
      conditionalOperator: data.rule.conditionalOperator,
      conditions: data.rule.conditions,
      actions: data.rule.actions,
      ...changes,
    });
  };

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label>Conditions</Label>
              <div className="inline-flex items-center rounded-[7px] bg-muted p-0.5 text-xs font-medium text-muted-foreground">
                {[
                  { value: LogicalOperator.OR, label: "Match any" },
                  { value: LogicalOperator.AND, label: "Match all" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isExecuting}
                    onClick={() => save({ conditionalOperator: option.value })}
                    className={cn(
                      "rounded-[5px] px-2.5 py-1",
                      data.rule.conditionalOperator === option.value &&
                        "bg-background text-foreground shadow-sm",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <RuleEntryList
              entries={data.rule.conditions.map((condition, index) => ({
                key: `${condition.type}-${index}`,
                badge: CONDITION_BADGES[condition.type] ?? condition.type,
                text: conditionText(condition),
                // The engine needs at least one condition, so the last one
                // can only be replaced in the editor, not removed here
                onRemove:
                  data.rule.conditions.length > 1
                    ? () =>
                        save({
                          conditions: data.rule.conditions.filter(
                            (_, other) => other !== index,
                          ),
                        })
                    : undefined,
              }))}
              disabled={isExecuting}
              addLabel="Add condition"
              onAdd={() => onEditRule({ ruleId })}
            />
          </div>

          <div>
            <Label>Actions</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              What happens when a match arrives.
            </p>
            <RuleEntryList
              entries={data.rule.actions.map((action, index) => ({
                key: action.id ?? `${action.type}-${index}`,
                badge: ACTION_TYPE_LABELS[action.type],
                text: getActionDisplay(
                  {
                    ...action,
                    labelId: action.labelId?.value,
                    label: action.labelId?.name,
                    content: action.content?.value,
                    to: action.to?.value,
                    folderName: action.folderName?.value,
                  },
                  provider,
                  userLabels,
                ),
                onRemove:
                  data.rule.actions.length > 1
                    ? () =>
                        save({
                          actions: data.rule.actions.filter(
                            (_, other) => other !== index,
                          ),
                        })
                    : undefined,
              }))}
              disabled={isExecuting}
              addLabel="Add action"
              onAdd={() => onEditRule({ ruleId })}
            />
          </div>
        </div>
      )}
    </LoadingContent>
  );
}

function RuleEntryList({
  entries,
  disabled,
  addLabel,
  onAdd,
}: {
  entries: {
    key: string;
    badge: string;
    text: string;
    onRemove?: () => void;
  }[];
  disabled: boolean;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <>
      <div className="mt-2 divide-y divide-border overflow-hidden rounded-[10px] border border-border bg-card">
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="flex items-baseline gap-2 px-3 py-2.5"
          >
            <Badge variant="secondary" className="shrink-0">
              {entry.badge}
            </Badge>
            <span className="min-w-0 flex-1 break-words text-sm text-muted-foreground">
              {entry.text}
            </span>
            {entry.onRemove && (
              <Button
                variant="ghost"
                size="iconSm"
                className="shrink-0"
                disabled={disabled}
                onClick={entry.onRemove}
              >
                <span className="sr-only">Remove</span>
                <XIcon className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 border border-dashed border-border text-muted-foreground"
        onClick={onAdd}
      >
        <PlusIcon className="mr-1.5 size-3.5" />
        {addLabel}
      </Button>
    </>
  );
}

const CONDITION_BADGES: Record<string, string> = {
  [ConditionType.AI]: "AI",
  [ConditionType.STATIC]: "Static",
  [ConditionType.LEARNED_PATTERN]: "Group",
  [ConditionType.PRESET]: "Preset",
};

function conditionText(condition: RuleResponse["rule"]["conditions"][number]) {
  if (condition.type === ConditionType.AI) {
    return condition.instructions || "No instructions";
  }
  // The stored rule has no null excludes; the editor's schema allows them
  return (
    staticConditionsToString({
      from: condition.from,
      to: condition.to,
      subject: condition.subject,
      body: condition.body,
      fromExclude: condition.fromExclude ?? undefined,
      toExclude: condition.toExclude ?? undefined,
      subjectExclude: condition.subjectExclude ?? undefined,
    }) || "No fields set"
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
