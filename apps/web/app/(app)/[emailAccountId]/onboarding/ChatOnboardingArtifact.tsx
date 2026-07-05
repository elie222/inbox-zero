"use client";

import {
  CheckIcon,
  MailXIcon,
  PenLineIcon,
  SparklesIcon,
  TagsIcon,
  WandSparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { ButtonCheckbox } from "@/components/ButtonCheckbox";
import { DomainIcon } from "@/components/charts/DomainIcon";
import { Progress } from "@/components/ui/progress";
import {
  IconCircle,
  type IconCircleColor,
} from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import type { ChatOnboardingCategory } from "@/app/(app)/[emailAccountId]/onboarding/chatOnboardingScript";
import type { NewsletterStatsResponse } from "@/app/api/user/stats/newsletters/route";
import { extractDomainFromEmail } from "@/utils/email";
import { cn } from "@/utils";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

export type ChatOnboardingArtifactMode =
  | "idle"
  | "labels"
  | "rules"
  | "unsubscribe"
  | "summary";

const HEADERS: Record<
  ChatOnboardingArtifactMode,
  { title: string; status: string; Icon: React.ElementType; iconColor: string }
> = {
  idle: {
    title: "Setup",
    status: "Waiting",
    Icon: SparklesIcon,
    iconColor: "bg-slate-100 text-slate-500 dark:bg-slate-800",
  },
  labels: {
    title: "Labels",
    status: "Draft",
    Icon: TagsIcon,
    iconColor: "bg-purple-50 text-purple-600 dark:bg-purple-950",
  },
  rules: {
    title: "Rules",
    status: "Draft",
    Icon: WandSparklesIcon,
    iconColor: "bg-blue-50 text-blue-600 dark:bg-blue-950",
  },
  unsubscribe: {
    title: "Bulk Unsubscribe",
    status: "Choose",
    Icon: MailXIcon,
    iconColor: "bg-red-50 text-red-600 dark:bg-red-950",
  },
  summary: {
    title: "You're all set",
    status: "Live",
    Icon: CheckIcon,
    iconColor: "bg-green-50 text-green-600 dark:bg-green-950",
  },
};

export function ChatOnboardingArtifact({
  mode,
  updating,
  categories,
  unsubscribe,
  summary,
  className,
}: {
  mode: ChatOnboardingArtifactMode;
  updating: boolean;
  categories: ChatOnboardingCategory[];
  unsubscribe: {
    senders: Newsletter[];
    totalCount: number;
    deselected: Set<string>;
    onToggle: (name: string) => void;
    selectedCount: number;
    onUnsubscribe: () => void;
    submitting: boolean;
  };
  summary: {
    unsubscribedFromCount: number;
    skippedCleanup: boolean;
  };
  className?: string;
}) {
  const header = HEADERS[mode];

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background shadow-sm",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            header.iconColor,
          )}
        >
          <header.Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 text-sm font-medium">{header.title}</div>
        <span className="text-xs font-medium text-muted-foreground">
          {updating ? "Updating…" : header.status}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {mode === "idle" && <IdleContent />}
        {mode === "labels" && <LabelsContent categories={categories} />}
        {mode === "rules" && <RulesContent categories={categories} />}
        {mode === "unsubscribe" && <UnsubscribeContent {...unsubscribe} />}
        {mode === "summary" && (
          <SummaryContent categories={categories} {...summary} />
        )}
      </div>
    </div>
  );
}

function IdleContent() {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3.5 px-5 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800">
        <SparklesIcon className="size-6" />
      </span>
      <p className="max-w-64 text-sm leading-relaxed text-muted-foreground">
        Your setup will build here as we talk — labels, rules, and cleanup.
      </p>
    </div>
  );
}

function LabelsContent({
  categories,
}: {
  categories: ChatOnboardingCategory[];
}) {
  return (
    <div className="flex flex-col gap-2 duration-300 animate-in fade-in slide-in-from-bottom-2">
      <p className="mb-1 text-sm text-muted-foreground">
        I'll auto-apply these to every incoming email:
      </p>
      {categories.map((category) => (
        <div
          key={category.key}
          className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5"
        >
          <IconCircle
            size="sm"
            color={category.iconColor as IconCircleColor}
            Icon={category.Icon}
          />
          <span className="flex-1 text-sm font-medium">{category.label}</span>
          <span className="text-xs text-muted-foreground">{category.hint}</span>
        </div>
      ))}
    </div>
  );
}

function RulesContent({
  categories,
}: {
  categories: ChatOnboardingCategory[];
}) {
  return (
    <div className="flex flex-col gap-2.5 duration-300 animate-in fade-in slide-in-from-bottom-2">
      <p className="mb-0.5 text-sm text-muted-foreground">
        Automations that run the moment mail lands:
      </p>
      {categories.map((category) => (
        <div
          key={category.key}
          className="flex items-start gap-3 rounded-xl border bg-background p-3"
        >
          <IconCircle
            size="sm"
            color={category.iconColor as IconCircleColor}
            Icon={category.Icon}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">
              When {category.when}
            </div>
            <div className="text-sm font-medium">{category.then}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UnsubscribeContent({
  senders,
  totalCount,
  deselected,
  onToggle,
  selectedCount,
  onUnsubscribe,
  submitting,
}: {
  senders: Newsletter[];
  totalCount: number;
  deselected: Set<string>;
  onToggle: (name: string) => void;
  selectedCount: number;
  onUnsubscribe: () => void;
  submitting: boolean;
}) {
  const moreCount = totalCount - senders.length;

  return (
    <div className="flex h-full flex-col duration-300 animate-in fade-in slide-in-from-bottom-2">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Uncheck any you want to keep.
        </p>
        <span className="text-xs font-semibold text-blue-600">
          {selectedCount} selected
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {senders.map((sender) => {
          const domain = extractDomainFromEmail(sender.name) || sender.name;
          const readPercentage =
            sender.value > 0
              ? Math.round((sender.readEmails / sender.value) * 100)
              : 0;

          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the row only enlarges the ButtonCheckbox's click target; keyboard users toggle via the focusable checkbox
            <div
              key={sender.name}
              onClick={() => onToggle(sender.name)}
              className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left"
            >
              <ButtonCheckbox
                checked={!deselected.has(sender.name)}
                onChange={() => onToggle(sender.name)}
              />
              <DomainIcon domain={domain} size={28} variant="circular" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {sender.fromName || sender.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {sender.value} {sender.value === 1 ? "email" : "emails"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Progress
                  value={readPercentage}
                  className="h-1.5 w-14 bg-amber-100 dark:bg-amber-950"
                  innerClassName="bg-amber-400"
                />
                <span className="w-12 whitespace-nowrap text-xs tabular-nums text-amber-600 dark:text-amber-400">
                  {readPercentage}% read
                </span>
              </div>
            </div>
          );
        })}
        {moreCount > 0 && (
          <p className="px-0.5 py-1 text-xs text-muted-foreground">
            + {moreCount} more like these — find them in Bulk Unsubscribe later.
          </p>
        )}
      </div>

      <Button
        className="mt-3 w-full shrink-0"
        onClick={onUnsubscribe}
        disabled={submitting}
      >
        {submitting && <ButtonLoader />}
        {selectedCount > 0
          ? `Unsubscribe from ${selectedCount}`
          : "Keep them all"}
      </Button>
    </div>
  );
}

function SummaryContent({
  categories,
  unsubscribedFromCount,
  skippedCleanup,
}: {
  categories: ChatOnboardingCategory[];
  unsubscribedFromCount: number;
  skippedCleanup: boolean;
}) {
  const items = [
    { Icon: TagsIcon, label: `${categories.length} labels created` },
    { Icon: WandSparklesIcon, label: `${categories.length} rules turned on` },
    { Icon: PenLineIcon, label: "Learning how you work from this chat" },
    ...(unsubscribedFromCount > 0
      ? [
          {
            Icon: MailXIcon,
            label: `Unsubscribed from ${unsubscribedFromCount} ${
              unsubscribedFromCount === 1 ? "sender" : "senders"
            }`,
          },
        ]
      : skippedCleanup
        ? [{ Icon: MailXIcon, label: "Inbox already clean — nothing to cut" }]
        : []),
  ];

  return (
    <div className="flex flex-col gap-3.5 duration-300 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-3 rounded-xl bg-green-50 p-3.5 dark:bg-green-950">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white">
          <CheckIcon className="size-5" />
        </span>
        <div>
          <div className="text-sm font-semibold">
            Your inbox is running itself
          </div>
          <div className="text-xs text-muted-foreground">
            Everything below is live right now.
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950">
              <item.Icon className="size-3.5" />
            </span>
            <span className="text-sm">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
